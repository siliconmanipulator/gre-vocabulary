package com.greascent.app;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.*;
import android.speech.tts.*;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import android.text.*;
import org.json.*;
import java.io.*;
import java.util.*;

/** A fully native offline Android UI. No browser, WebView, network or exit interception. */
public class MainActivity extends Activity {
    StudyEngine engine;
    final HashMap<String,JSONObject> wordData=new HashMap<>(),families=new HashMap<>();
    final ArrayList<JSONObject> questions=new ArrayList<>();
    LinearLayout root,body,nav;
    ScrollView mainScroll;
    TextView timerLabel;
    TextView wordPositionLabel;
    HorizontalScrollView wordRail;
    final ArrayList<Button> wordNumbers=new ArrayList<>();
    LinearLayout learningContent;
    File stateFile;
    TextToSpeech tts;
    boolean voiceReady=false,foreground=false,rendering=false;
    View swipeCard;
    float swipeX,swipeY;
    boolean swipeStarted=false;
    int bg,surface,fg,muted,accent,warm,error,border;
    final Handler handler=new Handler(Looper.getMainLooper());
    long tickTime,launchedAt;
    Runnable feedbackAdvance,carouselTick;
    LinearLayout troubleContent;
    final Runnable ticker=new Runnable(){public void run(){
        if(engine!=null&&foreground){
            accountElapsed();save();if(timerLabel!=null)timerLabel.setText(timerText());
        }
        handler.postDelayed(this,1000);
    }};

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);launchedAt=SystemClock.elapsedRealtime();stateFile=new File(getFilesDir(),"study-state-v1.bin");
        setContentView(new StartupView());

        new Thread(()->{
            try{
                JSONObject data=new JSONObject(readAsset("content.json"));
                ArrayList<StudyEngine.Word> ws=new ArrayList<>();JSONArray words=data.getJSONArray("words");
                for(int i=0;i<words.length();i++){
                    JSONObject w=words.getJSONObject(i);String id=w.getString("id");wordData.put(id,w);
                    StudyEngine.Word item=new StudyEngine.Word(id,w.getString("term"),w.getString("meaning"),w.getInt("order"));
                    JSONArray fs=w.getJSONArray("families");for(int j=0;j<fs.length();j++)item.families.add(fs.getString(j));ws.add(item);
                }
                JSONArray fs=data.getJSONArray("families");for(int i=0;i<fs.length();i++){JSONObject f=fs.getJSONObject(i);families.put(f.getString("id"),f);}
                JSONArray qs=data.getJSONArray("questions");for(int i=0;i<qs.length();i++)questions.add(qs.getJSONObject(i));
                engine=new StudyEngine(ws,StudyEngine.load(stateFile));
                if(saved==null)engine.s.screen="today"; // Cold launch opens the requested welcome/slideshow; saved quizzes remain resumable.
                runOnUiThread(()->handler.postDelayed(()->{if(isFinishing()||isDestroyed())return;render();initTts();tickTime=SystemClock.elapsedRealtime();handler.post(ticker);},android.animation.ValueAnimator.areAnimatorsEnabled()?Math.max(0,600-(SystemClock.elapsedRealtime()-launchedAt)):0));
            }catch(Exception ex){runOnUiThread(()->showFatal(ex));}
        },"content-loader").start();
    }
    String readAsset(String name)throws IOException{try(InputStream in=getAssets().open(name);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toString("UTF-8");}}
    void showFatal(Exception ex){LinearLayout l=new LinearLayout(this);l.setOrientation(1);l.setPadding(24,48,24,24);TextView t=new TextView(this);t.setText("Unable to open local study data\n\n"+ex.getClass().getSimpleName()+": "+ex.getMessage()+"\n\nYour saved state and source files have not been deleted. Reopen after restoring a compatible app build.");t.setTextSize(18);l.addView(t);setContentView(l);}
    void save(){if(engine==null)return;try{StudyEngine.save(engine.s,stateFile);}catch(Exception ex){Toast.makeText(this,"Could not save progress: "+ex.getMessage(),Toast.LENGTH_LONG).show();}}
    @Override protected void onResume(){super.onResume();foreground=true;tickTime=SystemClock.elapsedRealtime();if(engine!=null){schedulePendingAdvance();scheduleCarousel();}}
    @Override protected void onPause(){
        if(engine!=null&&foreground){accountElapsed();save();}
        cancelAdvance();cancelCarousel();foreground=false;if(tts!=null)tts.stop();super.onPause();
    }
    @Override protected void onDestroy(){cancelAdvance();cancelCarousel();handler.removeCallbacksAndMessages(null);if(tts!=null)tts.shutdown();super.onDestroy();}
    void accountElapsed(){long now=SystemClock.elapsedRealtime();if(engine!=null&&foreground){long elapsed=Math.max(0,now-tickTime);engine.recordUsage(elapsed,true);if(engine.consumeFocus(elapsed,true))Toast.makeText(this,"Focus session complete. You can keep studying or take a break.",Toast.LENGTH_LONG).show();}tickTime=now;}
    void beginReview(){accountElapsed();engine.startReview();save();render();}
    @Override public boolean dispatchTouchEvent(MotionEvent event){
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN){swipeStarted=false;if(swipeCard!=null){Rect bounds=new Rect();swipeCard.getGlobalVisibleRect(bounds);swipeStarted=bounds.contains((int)event.getRawX(),(int)event.getRawY());swipeX=event.getRawX();swipeY=event.getRawY();}}
        if(event.getActionMasked()==MotionEvent.ACTION_UP&&swipeStarted&&engine!=null&&engine.s.screen.equals("learn")&&engine.s.session!=null&&!engine.s.session.quiz){float delta=event.getRawX()-swipeX;if(Math.abs(delta)>dp(70)&&Math.abs(event.getRawY()-swipeY)<dp(65)){event.setAction(MotionEvent.ACTION_CANCEL);super.dispatchTouchEvent(event);moveCard(delta<0?1:-1);swipeStarted=false;return true;}}
        return super.dispatchTouchEvent(event);
    }

    void initTts(){
        try{tts=new TextToSpeech(this,status->{
            if(status!=TextToSpeech.SUCCESS)return;
            try{
                Voice choice=null;Set<Voice> voices=tts.getVoices();
                if(voices!=null)for(Voice v:voices)if(v.getLocale().getLanguage().equals("en")&&!v.isNetworkConnectionRequired()){
                    choice=v;if(v.getLocale().equals(Locale.US))break;
                }
                if(choice!=null){voiceReady=tts.setVoice(choice)!=TextToSpeech.ERROR;tts.setSpeechRate(.88f);}
            }catch(Exception ignored){voiceReady=false;}
        });}catch(Exception ignored){voiceReady=false;}
    }
    void speak(String exact){if(!voiceReady||tts==null){Toast.makeText(this,"Offline English voice unavailable. Enable an installed offline voice in Android Text-to-speech settings.",Toast.LENGTH_LONG).show();return;}try{if(tts.speak(exact,TextToSpeech.QUEUE_FLUSH,null,"source-word")==TextToSpeech.ERROR)Toast.makeText(this,"Pronunciation unavailable. You can keep studying.",Toast.LENGTH_SHORT).show();}catch(Exception ex){Toast.makeText(this,"Pronunciation unavailable. You can keep studying.",Toast.LENGTH_SHORT).show();}}
    int dp(float x){return (int)(x*getResources().getDisplayMetrics().density+.5f);}
    int col(String x){return Color.parseColor(x);}
    void palette(){boolean light=engine.s.theme.equals("light");bg=col(light?"#F5F2EC":"#101323");surface=col(light?"#FFFDF8":"#1A1E32");fg=col(light?"#232238":"#F0EEFB");muted=col(light?"#66637C":"#AAAAC3");accent=col(light?"#5D43B1":"#B7A4FF");warm=col(light?"#98601E":"#EDBC87");error=col(light?"#A53A31":"#F1A69A");border=col(light?"#DDD7E4":"#30344B");}
    GradientDrawable rounded(int color,int radius){GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(radius));g.setStroke(dp(1),border);return g;}
    LinearLayout column(){LinearLayout l=new LinearLayout(this);l.setOrientation(1);return l;}
    LinearLayout row(){LinearLayout l=new LinearLayout(this);l.setOrientation(0);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
    TextView text(String value,int size,int color){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setLineSpacing(dp(3),1.05f);t.setFontFeatureSettings("kern");t.setTextIsSelectable(true);return t;}
    void addText(LinearLayout p,String value,int size,int color){TextView t=text(value,size,color);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(6);p.addView(t,lp);}
    void eyebrow(LinearLayout p,String value){TextView t=text(value.toUpperCase(Locale.US),14,warm);t.setLetterSpacing(.07f);t.setTypeface(Typeface.create("sans-serif-medium",0));p.addView(t);space(p,5);}
    void space(LinearLayout p,int n){Space s=new Space(this);p.addView(s,new LinearLayout.LayoutParams(1,dp(n)));}
    LinearLayout card(LinearLayout p){LinearLayout c=column();c.setPadding(dp(14),dp(14),dp(14),dp(14));c.setBackground(rounded(surface,20));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(8);p.addView(c,lp);return c;}
    Button button(LinearLayout p,String label,Runnable action,boolean primary){
        Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(15);b.setTextColor(primary?bg:accent);b.setTypeface(Typeface.create("sans-serif-medium",0));b.setMinHeight(dp(52));b.setMinimumHeight(dp(52));b.setPadding(dp(12),dp(10),dp(12),dp(10));
        b.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(0x339D86F0),rounded(primary?accent:surface,14),null));
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(7);p.addView(b,lp);b.setOnClickListener(v->action.run());SpringMotion.bindPress(b);return b;
    }
    void meter(LinearLayout p,String label,int n,int total){
        addText(p,label,13,muted);addText(p,n+" / "+total+"   ·   "+(total==0?0:Math.round(100f*n/total))+"%",24,fg);
        ProgressBar progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(Math.max(1,total));progress.setProgress(n);progress.setProgressTintList(android.content.res.ColorStateList.valueOf(accent));progress.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(border));p.addView(progress,new LinearLayout.LayoutParams(-1,dp(8)));
    }
    void heading(String kicker,String title,String subtitle){LinearLayout line=row();TextView label=text(title,32,fg);line.addView(label,new LinearLayout.LayoutParams(0,-2,1));settingsButton(line);body.addView(line);if(!subtitle.isEmpty())addText(body,subtitle,16,muted);}
    void settingsButton(LinearLayout line){Button settings=new Button(this);settings.setText("⚙");settings.setTextSize(23);settings.setTextColor(muted);settings.setPadding(0,0,0,0);settings.setBackgroundColor(Color.TRANSPARENT);settings.setContentDescription("Settings and theme");line.addView(settings,new LinearLayout.LayoutParams(dp(48),dp(48)));settings.setOnClickListener(v->go("settings"));}
    void quizHeader(){LinearLayout line=row();StudyEngine.Session x=engine.s.session;TextView count=text((x.mode.equals("previous")?"Previous mistakes · ":x.mode.equals("retention")?"Keep it fresh · ":"")+(x.index+1)+" / "+x.queue.size(),16,muted);line.addView(count,new LinearLayout.LayoutParams(0,-2,1));settingsButton(line);body.addView(line);}
    void revealFeedback(LinearLayout feedback){feedback.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);ScrollView scroll=mainScroll;if(scroll!=null)scroll.post(()->scroll.smoothScrollTo(0,Math.max(0,feedback.getTop()-dp(8))));}
    void cancelAdvance(){if(feedbackAdvance!=null){handler.removeCallbacks(feedbackAdvance);feedbackAdvance=null;}}
    void schedulePendingAdvance(){
        cancelAdvance();if(engine==null||root==null||!foreground)return;StudyEngine.Session x=engine.s.session;
        if(engine.s.screen.equals("learn")&&x!=null&&x.quiz&&x.feedback&&!x.holdFeedback&&x.index<x.queue.size()&&engine.format().equals("Meaning MCQ")){
            int index=x.index;feedbackAdvance=()->{feedbackAdvance=null;if(!foreground||!engine.s.screen.equals("learn")||engine.s.session!=x||x.index!=index||!x.feedback||x.holdFeedback)return;accountElapsed();engine.nextQuestion();save();render();};handler.postDelayed(feedbackAdvance,x.correct?1500:2800);
        }else if(engine.s.screen.equals("practice")&&engine.s.officialFeedback&&!engine.s.officialHoldFeedback&&!engine.s.practiceComplete){
            int index=engine.s.practiceIndex;ArrayList<JSONObject> qs=practiceQuestions();if(index<0||index>=qs.size())return;boolean correct=selectedCorrect(qs.get(index).optJSONArray("answers"));
            feedbackAdvance=()->{feedbackAdvance=null;if(!foreground||!engine.s.screen.equals("practice")||engine.s.practiceIndex!=index||!engine.s.officialFeedback||engine.s.officialHoldFeedback)return;accountElapsed();if(index+1>=qs.size())engine.s.practiceComplete=true;else{engine.s.practiceIndex++;clearOfficial();}save();render();};handler.postDelayed(feedbackAdvance,correct?1500:2800);
        }
    }
    void beginRetention(){accountElapsed();engine.startRetention();save();render();}
    void beginPreviousMistakes(){accountElapsed();engine.startPreviousMistakes();save();render();}
    void go(String screen){accountElapsed();engine.s.screen=screen;save();render();}
    void render(){
        if(engine==null)return;cancelAdvance();cancelCarousel();troubleContent=null;rendering=true;palette();timerLabel=null;swipeCard=null;learningContent=null;wordRail=null;wordNumbers.clear();wordPositionLabel=null;
        getWindow().setStatusBarColor(bg);getWindow().setNavigationBarColor(surface);
        getWindow().getDecorView().setSystemUiVisibility(engine.s.theme.equals("light")?View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR:0);
        root=column();root.setBackgroundColor(bg);root.setFitsSystemWindows(true);setContentView(root);
        // Keep system bar insets outside the native content under target SDK 35 edge-to-edge.
        root.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});
        if(Build.VERSION.SDK_INT<30)root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        ScrollView scroll=new ScrollView(this);mainScroll=scroll;scroll.setVerticalScrollBarEnabled(false);scroll.setFillViewport(true);scroll.setClipToPadding(false);body=column();body.setPadding(dp(16),dp(10),dp(16),dp(18));scroll.addView(body);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        String screen=engine.s.screen;
        if(screen.equals("learn"))learn();else if(screen.equals("library"))library();else if(screen.equals("practice"))practice();else if(screen.equals("progress"))progress();else if(screen.equals("settings"))settings();else if(screen.equals("review"))review();else today();
        nav=row();nav.setBackgroundColor(surface);String[] names={"Today","Learn","Practice","Library","Journey"};String[] screens={"today","learn","practice","library","progress"};
        int[] icons={R.drawable.nav_today,R.drawable.nav_learn,R.drawable.nav_practice,R.drawable.nav_library,R.drawable.nav_progress};
        for(int i=0;i<names.length;i++){final String target=screens[i];boolean active=screen.equals(target);Button b=new Button(this);b.setText(names[i]);b.setAllCaps(false);b.setTextSize(14);b.setPadding(dp(2),dp(8),dp(2),dp(7));b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(dp(68));b.setTextColor(active?accent:muted);Drawable icon=getDrawable(icons[i]).mutate();icon.setTint(active?accent:muted);icon.setBounds(0,0,dp(24),dp(24));b.setCompoundDrawables(null,icon,null,null);b.setCompoundDrawablePadding(dp(4));b.setSelected(active);b.setBackground(active?rounded(surface,12):new ColorDrawable(Color.TRANSPARENT));SpringMotion.bindPress(b);nav.addView(b,new LinearLayout.LayoutParams(0,-2,1));b.setOnClickListener(v->{if(target.equals("learn")&&engine.s.session==null){beginFirstBlock();}else go(target);});}

        root.addView(nav);root.requestApplyInsets();SpringMotion.enter(body);rendering=false;schedulePendingAdvance();scheduleCarousel();
    }
    String timerText(){Long r=engine.s.timers.get(engine.s.studyDay);if(r==null)return "◷  60:00 · starts with your plan";long seconds=(r+999)/1000;return String.format(Locale.US,"◷  %02d:%02d · %s",seconds/60,seconds%60,r==0?"Focus complete · keep studying freely":"foreground focus time");}
    void timer(LinearLayout p){timerLabel=text(timerText(),14,warm);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(10);p.addView(timerLabel,lp);}
    void beginFirstBlock(){int day=engine.s.studyDay;if(!engine.pendingPreviousMistakes().isEmpty()){beginPreviousMistakes();return;}if(day>engine.dayCount()){go("review");return;}for(int b=1;b<=3;b++){List<StudyEngine.Word> list=engine.block(day,b);if(!list.isEmpty()&&engine.count(list)<list.size()){startBlock(day,b);return;}}startBlock(day,1);}
    void startBlock(int day,int block){
        openBlock(day,block);
    }
    void openBlock(int day,int block){try{accountElapsed();engine.startBlock(day,block);save();render();}catch(Exception ex){Toast.makeText(this,ex.getMessage(),Toast.LENGTH_LONG).show();}}
    void today(){
        int day=engine.s.studyDay;heading("YOUR DAILY CLIMB","A little higher.\nEvery day.","STUDY DAY "+String.format(Locale.US,"%02d",day)+" · "+engine.dayCount()+" vocabulary days");
        troubleCarousel();
        int pending=engine.pendingPreviousMistakes().size();if(pending>0){LinearLayout task=card(body);eyebrow(task,"Pending · Previous mistakes");addText(task,pending+" meaning question"+(pending==1?"":"s"),22,fg);addText(task,"From earlier vocabulary mistakes. Finish this quiz before today’s new words.",16,muted);button(task,"Start Previous mistakes →",()->beginPreviousMistakes(),true);}
        LinearLayout peak=card(body);peak.addView(new MountainView(),new LinearLayout.LayoutParams(-1,dp(155)));streak(peak);progressPanel(body);
        if(day>engine.dayCount())addText(body,"New vocabulary complete. Continue with spaced reviews or replay the library.",16,fg);
        else if(engine.dayComplete(day))addText(body,"Day complete. One ridge higher.",18,accent);
        if(engine.s.session!=null&&engine.s.session.index<engine.s.session.queue.size())button(body,"Resume saved study session →",()->go("learn"),true);
        for(int block=1;block<=3;block++){
            final int b=block;List<StudyEngine.Word> list=engine.block(day,b);if(list.isEmpty())continue;
            LinearLayout c=card(body);eyebrow(c,"0"+b+"  /  BLOCK "+b);meter(c,list.size()+" individual words",engine.count(list),list.size());button(c,engine.count(list)==list.size()?"Replay block →":"Begin block →",()->startBlock(day,b),false);
        }
        button(body,"Due reviews  ·  "+engine.scheduledDueNow().size()+" →",()->go("review"),false);
        int fresh=engine.retentionDue().size();if(fresh>0){LinearLayout old=card(body);eyebrow(old,"Keep it fresh");addText(old,fresh+" older words due",22,fg);button(old,"Review older words →",()->beginRetention(),true);}

        if(engine.dayComplete(day)||day>engine.dayCount())button(body,day>=engine.dayCount()?"Advance to next review day →":"Continue to Day "+(day+1)+" →",()->{accountElapsed();engine.advanceDay();save();render();},true);
        timer(body);addText(body,"Focus time pauses while the app is away. Leaving is always allowed.",12,muted);
    }
    void learn(){
        StudyEngine.Session x=engine.s.session;
        if(x==null){heading("LEARN","Your next ascent.","Choose a block from Today or replay a day in Library.");button(body,"Open today’s plan →",()->go("today"),true);return;}
        if(x.queue.isEmpty()){heading("REVIEW","Nothing due right now.","Confirmation days will appear here when due.");button(body,"Back to Today",()->go("today"),true);return;}
        if((x.mode.equals("review")||x.mode.equals("new"))&&!x.feedback&&!engine.pendingPreviousMistakes().isEmpty()){engine.startPreviousMistakes();x=engine.s.session;save();}
        if(x.quiz&&x.index>=x.queue.size()){sessionComplete();return;}
        String id=engine.current();
        if(x.quiz){quizHeader();quiz(id);return;}
        heading("","One word at a time.","Day "+x.lessonDay+" · Block "+x.block);
        wordPositions(body);learningContent=column();body.addView(learningContent);renderLearningCard();
    }
    void renderLearningCard(){
        if(learningContent==null)return;LinearLayout target=learningContent;target.removeAllViews();timerLabel=null;StudyEngine.Session x=engine.s.session;String id=engine.current();StudyEngine.Word w=engine.byId.get(id);
        LinearLayout c=card(target);familyLabel(c,id);TextView word=text(w.term,42,fg);word.setTypeface(Typeface.create("serif",0));word.setGravity(Gravity.CENTER);word.setPadding(0,dp(14),0,dp(6));word.setTextIsSelectable(false);c.addView(word);TextView english=text(w.meaning,18,fg);english.setGravity(Gravity.CENTER);english.setPadding(0,0,0,dp(12));c.addView(english);
        JSONObject family=families.get(wordData.get(id).optJSONArray("families").optString(0));int relatedCount=family==null?0:Math.max(0,family.optJSONArray("words").length()-1);
        LinearLayout related=column();familyWords(related,id);related.setVisibility(View.GONE);Button relatedToggle=button(c,"Related words · "+relatedCount+"  ▾",()->related.setVisibility(related.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE),false);relatedToggle.setTextSize(14);c.addView(related);
        if(x.revealed){space(c,10);addText(c,value(wordData.get(id),"bengali"),19,fg);showDistinctions(c,id);}
        LinearLayout footer=row();TextView hint=text("Tap card to "+(x.revealed?"hide":"reveal")+" Bengali meaning & memory",14,muted);hint.setTextIsSelectable(false);footer.addView(hint,new LinearLayout.LayoutParams(0,-2,1));footer.addView(soundButton(w.term),new LinearLayout.LayoutParams(dp(48),dp(48)));c.addView(footer);
        Runnable flip=()->{engine.showMeanings(!engine.s.meaningsVisible);save();renderLearningCard();};c.setOnClickListener(v->flip.run());word.setOnClickListener(v->flip.run());hint.setOnClickListener(v->flip.run());
        swipeCard=c;SpringMotion.enter(c);
        c.setAccessibilityDelegate(new View.AccessibilityDelegate(){@Override public void onInitializeAccessibilityNodeInfo(View host,android.view.accessibility.AccessibilityNodeInfo info){super.onInitializeAccessibilityNodeInfo(host,info);info.addAction(new android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_FORWARD,"Next word"));info.addAction(new android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD,"Previous word"));}@Override public boolean performAccessibilityAction(View host,int action,Bundle args){if(action==android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_FORWARD){moveCard(1);return true;}if(action==android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD){moveCard(-1);return true;}return super.performAccessibilityAction(host,action,args);}});
        showExamples(c,id,false);if(x.revealed){eyebrow(c,"Memory scene");addText(c,value(wordData.get(id),"mnemonic"),18,fg);}
        button(target,"Open word details + history →",()->wordDialog(id),false);
        String conf=engine.s.confidence.get(id);if(conf!=null)addText(target,"Recorded: "+conf,14,accent);
        button(target,"✓  Confident · Done and dusted",()->mark(id,true),true);
        button(target,"↺  Needs revision · Not confident yet",()->mark(id,false),false);
        int seen=0;for(String wid:x.cards)if(engine.s.seen.contains(wid))seen++;
        addText(target,x.mode.equals("replay")?"Replay leaves new-learning progress and the active schedule unchanged.":seen+" / "+x.cards.size()+" flashcards recorded",13,muted);
        Button check=button(target,"Start "+x.coreCount+" core meaning checks →",()->{accountElapsed();engine.beginQuiz();save();render();},true);check.setEnabled(engine.canQuiz());
        if(!engine.canQuiz())addText(target,"Mark a confidence state on every card to unlock the block’s core checks.",13,muted);
        timer(target);
    }
    void jumpCard(int index){engine.jumpCard(index);save();if(learningContent!=null&&!engine.s.session.quiz){updateWordNumbers();renderLearningCard();}else render();}
    void moveCard(int delta){StudyEngine.Session x=engine.s.session;jumpCard(Math.max(0,Math.min(x.cards.size()-1,x.cardIndex+delta)));}
    void wordPositions(LinearLayout parent){
        StudyEngine.Session x=engine.s.session;wordPositionLabel=text("Word "+(x.cardIndex+1)+" / "+x.cards.size(),16,muted);parent.addView(wordPositionLabel);wordRail=new HorizontalScrollView(this);wordRail.setHorizontalScrollBarEnabled(false);LinearLayout line=row();wordNumbers.clear();
        for(int i=0;i<x.cards.size();i++){final int position=i;Button b=new Button(this);b.setText(Integer.toString(i+1));b.setTextSize(16);b.setAllCaps(false);b.setMinWidth(0);b.setMinimumWidth(0);b.setPadding(dp(2),0,dp(2),0);b.setContentDescription("Word "+(i+1)+" of "+x.cards.size()+": "+engine.byId.get(x.cards.get(i)).term);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(dp(44),dp(48));lp.rightMargin=dp(7);line.addView(b,lp);wordNumbers.add(b);b.setOnClickListener(v->jumpCard(position));}
        wordRail.addView(line);parent.addView(wordRail,new LinearLayout.LayoutParams(-1,dp(62)));updateWordNumbers();
    }
    void updateWordNumbers(){
        StudyEngine.Session x=engine.s.session;if(x==null||wordPositionLabel==null)return;wordPositionLabel.setText("Word "+(x.cardIndex+1)+" / "+x.cards.size());
        for(int i=0;i<wordNumbers.size();i++){Button b=wordNumbers.get(i);boolean current=i==x.cardIndex;b.setSelected(current);b.setTextColor(current?bg:muted);b.setBackground(rounded(current?accent:bg,10));}
        if(wordRail!=null&&x.cardIndex<wordNumbers.size()){Button current=wordNumbers.get(x.cardIndex);HorizontalScrollView rail=wordRail;rail.post(()->rail.smoothScrollTo(Math.max(0,current.getLeft()-rail.getWidth()/2+current.getWidth()/2),0));}
    }
    void familyWords(LinearLayout parent,String id){JSONObject w=wordData.get(id);JSONArray fs=w.optJSONArray("families");if(fs==null||fs.length()==0)return;JSONObject f=families.get(fs.optString(0));if(f==null)return;JSONArray ids=new JSONArray();JSONArray source=f.optJSONArray("words");for(int i=0;i<source.length();i++)if(!source.optString(i).equals(id))ids.put(source.optString(i));for(int start=0;start<ids.length();start+=2){LinearLayout line=row();for(int offset=0;offset<2;offset++){int n=start+offset;if(n>=ids.length()){line.addView(new Space(this),new LinearLayout.LayoutParams(0,dp(48),1));continue;}String wid=ids.optString(n);Button b=button(line,engine.byId.get(wid).term,()->{int position=engine.s.session.cards.indexOf(wid);if(position>=0)jumpCard(position);else wordDialog(wid);},wid.equals(id));b.setTextSize(26);b.setMinWidth(0);b.setMinimumWidth(0);b.setPadding(dp(5),dp(8),dp(5),dp(8));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);lp.setMargins(dp(3),dp(4),dp(3),dp(4));b.setLayoutParams(lp);}parent.addView(line);}}
    void mark(String id,boolean confident){StudyEngine.Session x=engine.s.session;engine.confidence(id,confident,x.mode.equals("replay")||engine.s.coreDone.contains(id));save();if(x.cardIndex<x.cards.size()-1)moveCard(1);else render();}
    View soundButton(String term){View b=new View(this){Paint p=new Paint(3);@Override protected void onDraw(Canvas canvas){super.onDraw(canvas);canvas.save();canvas.scale(getWidth()/48f,getHeight()/48f);p.setColor(accent);p.setStrokeWidth(1.8f);p.setStyle(Paint.Style.STROKE);p.setStrokeJoin(Paint.Join.ROUND);Path path=new Path();path.moveTo(24,14);path.lineTo(18,20);path.lineTo(14,20);path.lineTo(14,28);path.lineTo(18,28);path.lineTo(24,34);path.close();canvas.drawPath(path,p);canvas.drawArc(18,16,34,32,-55,110,false,p);canvas.drawArc(15,11,40,37,-50,100,false,p);canvas.restore();}};b.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(0x339D86F0),rounded(surface,14),null));b.setContentDescription("Pronounce "+term+" using offline device voice");b.setFocusable(true);b.setClickable(true);b.setOnClickListener(v->speak(term));return b;}
    void sound(LinearLayout p,String term){LinearLayout line=row();line.setGravity(Gravity.RIGHT);line.addView(soundButton(term),new LinearLayout.LayoutParams(dp(48),dp(48)));p.addView(line);}
    void familyLabel(LinearLayout p,String id){JSONObject w=wordData.get(id);JSONArray fs=w.optJSONArray("families");if(fs!=null&&fs.length()>0){JSONObject f=families.get(fs.optString(0));if(f!=null)addText(p,f.optString("title"),16,accent);}}
    void showExamples(LinearLayout parent,String id,boolean boxed){LinearLayout p=boxed?card(parent):parent;eyebrow(p,"Examples");JSONArray examples=wordData.get(id).optJSONArray("examples");if(examples==null||examples.length()==0){addText(p,"No example available.",15,muted);return;}for(int i=0;i<examples.length();i++){JSONObject example=examples.optJSONObject(i);addText(p,example.optString("text"),17,fg);String cite=example.optString("kind").equals("generated-practice")?example.optString("label"):example.optString("book")+(example.has("page")?" · PDF p. "+example.optInt("page"):" · "+example.optString("questionId"));if(example.optString("kind").equals("answer-completed"))cite+=" · completed from supplied answer key";if(!example.optString("kind").equals("generated-practice"))addText(p,cite,13,warm);}}
    String value(JSONObject obj,String k){String v=obj.optString(k,"");return v.isEmpty()?"Not provided in source":plain(v);}
    void showDistinctions(LinearLayout p,String id){JSONArray fs=wordData.get(id).optJSONArray("families");if(fs==null)return;for(int i=0;i<fs.length();i++){JSONObject f=families.get(fs.optString(i));if(f!=null){eyebrow(p,"Meaning distinctions");addText(p,value(f,"distinctions"),16,muted);}}}
    void details(LinearLayout p,String id,boolean full){
        JSONObject w=wordData.get(id);eyebrow(p,"English meaning");addText(p,value(w,"meaning"),18,fg);addText(p,value(w,"bengali"),19,fg);
        if(full){showDistinctions(p,id);showExamples(p,id,false);}
        eyebrow(p,"Memory scene");addText(p,value(w,"mnemonic"),18,fg);
        if(full){JSONArray fs=w.optJSONArray("families");if(fs!=null&&fs.length()>0){JSONObject f=families.get(fs.optString(0));if(f!=null){JSONArray ids=f.optJSONArray("words");String[] labels=new String[ids.length()];for(int i=0;i<ids.length();i++)labels[i]=engine.byId.get(ids.optString(i)).term;button(p,"Related words →",()->new AlertDialog.Builder(this).setTitle(f.optString("title")).setItems(labels,(dialog,index)->wordDialog(ids.optString(index))).setNegativeButton("Close",null).show(),false);}}}
        if(full&&!w.optString("notes").isEmpty()){eyebrow(p,"Source correction note");addText(p,value(w,"notes"),16,warm);}
    }
    String plain(String s){return s.replaceAll("\\[([^\\]]+)\\]\\([^)]+\\)","$1").replace("**","").replaceAll("\\*([^*\\n]+)\\*","$1").replace("<details>","").replace("</details>","").replaceAll("(?m)^<a id=\"[^\"]+\"></a>\\s*","").replaceAll("(?m)^<summary>.*?</summary>","").replaceAll("(?m)^---$","").replaceAll("(?m)^#{1,3} ","");}
    void holdCurrentFeedback(){cancelAdvance();if(engine.s.session!=null&&engine.s.session.feedback)engine.s.session.holdFeedback=true;if(engine.s.officialFeedback)engine.s.officialHoldFeedback=true;save();}
    void wordDialog(String id){
        holdCurrentFeedback();
        JSONObject w=wordData.get(id);ScrollView scroll=new ScrollView(this);scroll.setVerticalScrollBarEnabled(false);LinearLayout p=column();p.setPadding(dp(20),dp(20),dp(20),dp(24));p.setBackgroundColor(bg);scroll.addView(p);familyLabel(p,id);addText(p,w.optString("term"),36,fg);sound(p,w.optString("term"));space(p,18);details(p,id,true);button(p,"View complete history →",()->historyDialog(id),false);button(p,"View verbatim source record",()->sourceDialog("Vocabulary source",w.optString("raw")),false);
        new AlertDialog.Builder(this).setView(scroll).setPositiveButton("Close",null).show();
    }
    void sourceDialog(String title,String raw){holdCurrentFeedback();ScrollView s=new ScrollView(this);s.setVerticalScrollBarEnabled(false);TextView t=text(raw,15,fg);t.setPadding(dp(20),dp(16),dp(20),dp(24));t.setBackgroundColor(bg);s.addView(t);new AlertDialog.Builder(this).setTitle(title).setView(s).setPositiveButton("Close",null).show();}
    void historyDialog(String id){
        holdCurrentFeedback();
        ScrollView sc=new ScrollView(this);sc.setVerticalScrollBarEnabled(false);LinearLayout p=column();p.setPadding(dp(20),dp(16),dp(20),dp(24));p.setBackgroundColor(bg);sc.addView(p);int max=1;for(StudyEngine.Word w:engine.repetitionWords())max=Math.max(max,engine.repeatDays(w.id));repetitionRow(p,id,max,false);
        Button expand=button(p,"Show dated attempts and results",()->{},false);expand.setOnClickListener(v->{v.setVisibility(View.GONE);LinearLayout log=column();p.addView(log);boolean any=false;for(StudyEngine.Attempt attempt:engine.s.attempts)if(attempt.wordId.equals(id)){any=true;attemptRow(log,attempt);}if(!any)addText(log,"No test answers recorded yet. Confidence marks record a study day, not a correct test result.",15,muted);});
        button(p,"Inspect a study day",()->{NumberPicker picker=new NumberPicker(this);picker.setMinValue(1);picker.setMaxValue(Math.max(1,engine.s.studyDay));picker.setValue(engine.s.studyDay);new AlertDialog.Builder(this).setTitle("Choose study day").setView(picker).setPositiveButton("Inspect",(dialog,which)->{int day=picker.getValue();LinearLayout log=column();p.addView(log);eyebrow(log,"Study Day "+day);boolean any=false;for(StudyEngine.Attempt attempt:engine.s.attempts)if(attempt.wordId.equals(id)&&attempt.day==day){any=true;attemptRow(log,attempt);}if(!any)addText(log,engine.historyStatus(id,day),15,muted);}).setNegativeButton("Cancel",null).show();},false);
        DueText(p,id);new AlertDialog.Builder(this).setTitle(engine.byId.get(id).term+" · History").setView(sc).setPositiveButton("Close",null).show();
    }
    void attemptRow(LinearLayout parent,StudyEngine.Attempt a){addText(parent,"Day "+a.day+" · "+(a.correct?"✓ Correct":"✕ Incorrect")+" · "+a.type+(a.replay?" · Replay of Day "+a.lessonDay:""),17,a.correct?accent:error);addText(parent,a.date+" · "+a.timestamp+"\nResponse: "+a.response+"\nExpected: "+a.expected+"\nAttempt "+a.number+(a.questionId.isEmpty()?"":" · "+a.questionId),13,muted);}
    void repetitionBar(LinearLayout parent,int days,int max){ProgressBar line=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);line.setMax(Math.max(1,max));line.setProgress(days);line.setProgressTintList(android.content.res.ColorStateList.valueOf(accent));line.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(border));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(8));lp.topMargin=dp(12);lp.bottomMargin=dp(6);parent.addView(line,lp);}
    void repetitionRow(LinearLayout parent,String id,int max,boolean clickable){
        int days=engine.studyDays(id),repeats=engine.repeatDays(id);LinearLayout item=column();item.setPadding(0,dp(16),0,dp(16));LinearLayout line=row();TextView word=text(engine.byId.get(id).term,23,fg);line.addView(word,new LinearLayout.LayoutParams(0,-2,1));line.addView(text(repeats+" repeat day"+(repeats==1?"":"s"),14,accent),new LinearLayout.LayoutParams(-2,-2));item.addView(line);repetitionBar(item,repeats,max);addText(item,"Studied on "+days+" distinct study day"+(days==1?"":"s"),14,muted);item.setContentDescription(engine.byId.get(id).term+": "+days+" study days, "+repeats+" repeat days");if(clickable){item.setBackground(new RippleDrawable(android.content.res.ColorStateList.valueOf(0x339D86F0),null,null));item.setOnClickListener(v->historyDialog(id));item.setFocusable(true);for(int i=0;i<line.getChildCount();i++)if(line.getChildAt(i) instanceof TextView)((TextView)line.getChildAt(i)).setTextIsSelectable(false);}parent.addView(item);
    }
    void DueText(LinearLayout p,String id){StudyEngine.Due due=engine.s.due.get(id);addText(p,due!=null?"Next due: Day "+due.day+" · "+due.stage:engine.s.mastered.contains(id)?"Confirmation passed · outside active review queue":"No active review scheduled",15,accent);}
    void quiz(String id){
        StudyEngine.Session x=engine.s.session;StudyEngine.Word w=engine.byId.get(id);
        LinearLayout prompt=card(body);addText(prompt,w.meaning,21,fg);
        if(x.feedback){
            LinearLayout feedback=card(body);addText(feedback,x.correct?"✓ Correct":"✕ Let’s revisit this",24,x.correct?accent:error);if(engine.format().equals("Meaning MCQ")&&!x.holdFeedback)button(feedback,"Stay on this answer",()->{x.holdFeedback=true;cancelAdvance();save();render();},false);revealFeedback(feedback);addText(feedback,"Your answer: "+x.response,15,muted);addText(feedback,"Correct word: "+w.term,24,fg);details(feedback,id,false);DueText(feedback,id);sound(feedback,w.term);
            if(!x.correct)addText(feedback,(x.mode.equals("previous")||x.mode.equals("retention"))?"This word returns in tomorrow’s Previous mistakes quiz.":x.mode.equals("replay")||x.replayIds.contains(id)?"A retry is queued later. Replay history stays separate; your active review schedule is unchanged.":"A retry is queued later in this session. A correct retry keeps the next-day review.",14,warm);
            if(!engine.format().equals("Meaning MCQ")||x.holdFeedback)button(body,"Next question →",()->{accountElapsed();engine.nextQuestion();save();render();},true);return;
        }

        if(engine.format().equals("Meaning MCQ")){
            for(StudyEngine.Word opt:engine.options(id))button(body,opt.term,()->submit(opt.term),false);
        }else{
            EditText input=new EditText(this);input.setSingleLine(true);input.setTextColor(fg);input.setHintTextColor(muted);input.setHint("Type the word…");input.setTextSize(20);input.setPadding(dp(18),dp(16),dp(18),dp(16));input.setBackground(rounded(surface,14));input.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS|android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);input.setText(x.draft);body.addView(input,new LinearLayout.LayoutParams(-1,-2));
            input.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int count,int after){}public void onTextChanged(CharSequence s,int st,int before,int count){x.draft=s.toString();save();}public void afterTextChanged(Editable e){}});
            button(body,"Check spelling →",()->{if(!input.getText().toString().trim().isEmpty())submit(input.getText().toString());},true);
        }

    }
    void submit(String response){((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(root.getWindowToken(),0);engine.answer(response);save();render();}
    void sessionComplete(){
        StudyEngine.Session x=engine.s.session;
        if(x.mode.equals("retention")){heading("","Older words refreshed.","Next reviews are scheduled automatically.");button(body,"Back to Today",()->go("today"),true);return;}
        if(x.mode.equals("previous")){heading("","Previous mistakes complete.","Answers saved. Any missed words return tomorrow.");button(body,"Continue to today’s words →",()->beginFirstBlock(),true);button(body,"View error history →",()->go("progress"),false);return;}
        heading("SESSION COMPLETE","One ridge higher.",x.coreCount+" core checks · "+(x.queue.size()-x.coreCount)+" retries · all answers saved");
        progressPanel(body);LinearLayout c=card(body);DueText(c,x.cards.get(0));
        addText(c,"Your history stays with every word. New-word completion requires both a recorded flashcard and an answered core check.",16,fg);
        if(!engine.scheduledDueNow().isEmpty())button(body,"Continue with all "+engine.scheduledDueNow().size()+" due reviews →",()->beginReview(),true);
        button(body,"Return to Today →",()->{engine.s.session=null;go("today");},false);
    }
    void review(){
        heading("SPACED REPETITION","Room to remember.","Study Day "+engine.s.studyDay+" · reviews never count as new words");List<String> due=engine.scheduledDueNow();
        if(!engine.pendingPreviousMistakes().isEmpty())button(body,"Previous mistakes · "+engine.pendingPreviousMistakes().size()+" pending →",()->beginPreviousMistakes(),true);
        int old=engine.retentionDue().size();LinearLayout fresh=card(body);eyebrow(fresh,"Keep it fresh");addText(fresh,old>0?old+" older words due":"No older-word review due yet",20,fg);addText(fresh,"After confirmation, words return after 7, 14, 30, then 60 study days. Review order varies. Mistakes return tomorrow.",15,muted);if(old>0)button(fresh,"Start older-word quiz →",()->beginRetention(),true);
        LinearLayout intro=card(body);addText(intro,due.size()+" items due",26,fg);addText(intro,"Wrong or needs revision → next study day. Correct after a mistake → confirmation in two study days. Correct confirmation → leaves the queue, keeps its history.",15,muted);
        if(due.isEmpty())addText(intro,"Nothing due right now. Check Today or replay any completed day.",17,accent);
        else{if(due.size()>15)addText(intro,"The review block is longer: all "+due.size()+" due items are included.",16,warm);button(intro,"Start all due reviews →",()->beginReview(),true);}
        for(String id:due){LinearLayout c=card(body);addText(c,engine.byId.get(id).term,24,fg);DueText(c,id);button(c,"Details + history",()->wordDialog(id),false);}
    }
    Spinner dayPicker(LinearLayout p,int selected,java.util.function.IntConsumer change){Spinner spinner=new Spinner(this);ArrayList<String> labels=new ArrayList<>();for(int i=1;i<=engine.dayCount();i++)labels.add("Day "+i+"  ·  "+engine.day(i).size()+" words");ArrayAdapter<String> adapter=new ArrayAdapter<String>(this,android.R.layout.simple_spinner_item,labels){@Override public View getView(int pos,View reuse,android.view.ViewGroup parent){TextView v=(TextView)super.getView(pos,reuse,parent);v.setTextColor(fg);v.setTextSize(16);v.setPadding(dp(12),dp(10),dp(12),dp(10));return v;}};adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);spinner.setAdapter(adapter);spinner.setSelection(Math.max(0,Math.min(labels.size()-1,selected-1)));spinner.setMinimumHeight(dp(52));p.addView(spinner,new LinearLayout.LayoutParams(-1,-2));spinner.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){public void onItemSelected(android.widget.AdapterView<?> parent,View v,int pos,long id){if(pos+1!=selected)change.accept(pos+1);}public void onNothingSelected(android.widget.AdapterView<?> p){}});return spinner;}
    void library(){
        heading(engine.dayCount()+" DAYS · "+engine.words.size()+" ITEMS","Your word library.","Browse every day. Replays keep the active plan separate.");
        dayPicker(body,engine.s.libraryDay,day->{engine.s.libraryDay=day;save();render();});
        EditText search=new EditText(this);search.setTextColor(fg);search.setHintTextColor(muted);search.setHint("Search all source words…");search.setSingleLine(true);body.addView(search);
        LinearLayout results=column();body.addView(results);int day=engine.s.libraryDay;
        Runnable showDay=()->{
            results.removeAllViews();LinearLayout overview=card(results);eyebrow(overview,"DAY "+day+" · "+engine.status(day));List<StudyEngine.Word> ws=engine.day(day);meter(overview,"New vocabulary",engine.count(ws),ws.size());
            for(int b=1;b<=3;b++){final int block=b;List<StudyEngine.Word> list=engine.block(day,b);if(list.isEmpty())continue;Button begin=button(overview,(day<engine.s.studyDay||engine.dayComplete(day)?"Replay":"Learn")+" block "+b+" · "+list.size()+" items",()->startBlock(day,block),false);if(day>engine.s.studyDay)begin.setEnabled(false);}
            if(day>engine.s.studyDay)addText(overview,"Future day: details are available now. New learning opens when this becomes your active study day.",13,muted);
            for(StudyEngine.Word w:ws)wordRow(results,w);
            space(results,20);eyebrow(results,"ALL STUDY DAYS");for(int d=1;d<=engine.dayCount();d++){final int n=d;button(results,"Day "+n+" · "+engine.day(n).size()+" items · "+engine.status(n),()->{engine.s.libraryDay=n;save();render();},false);}
        };showDay.run();
        search.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void afterTextChanged(Editable e){}public void onTextChanged(CharSequence s,int st,int before,int count){String query=s.toString().trim().toLowerCase(Locale.US);if(query.isEmpty()){showDay.run();return;}results.removeAllViews();int matches=0;for(StudyEngine.Word w:engine.words)if(w.term.toLowerCase(Locale.US).contains(query)){wordRow(results,w);matches++;}if(matches==0)addText(results,"No source words match this search.",16,muted);}});
    }
    void wordRow(LinearLayout p,StudyEngine.Word w){LinearLayout c=card(p);addText(c,(engine.completed(w.id)?"✓  ":"")+w.term,23,fg);addText(c,"Day "+w.day()+" · Block "+w.block(),12,muted);button(c,"Details  /  ◖)) sound  /  history →",()->wordDialog(w.id),false);}
    ArrayList<JSONObject> dayQuestions(int day){ArrayList<JSONObject> list=new ArrayList<>();for(JSONObject q:questions){JSONArray days=q.optJSONArray("days");for(int i=0;i<days.length();i++)if(days.optInt(i)==day){list.add(q);break;}}return list;}
    ArrayList<JSONObject> practiceQuestions(){ArrayList<JSONObject> base=engine.s.practiceAll?new ArrayList<>(questions):dayQuestions(engine.s.practiceDay);ArrayList<JSONObject> list=new ArrayList<>();for(JSONObject q:base)if(StudyEngine.formatMatches(q.optString("type"),q.optInt("blankCount"),engine.s.practiceFilter))list.add(q);return list;}
    ArrayList<ArrayList<String>> questionGroups(JSONObject q){ArrayList<ArrayList<String>> result=new ArrayList<>();JSONArray groups=q.optJSONArray("choiceGroups");if(groups!=null)for(int i=0;i<groups.length();i++){ArrayList<String> labels=new ArrayList<>();JSONArray source=groups.optJSONObject(i).optJSONArray("labels");for(int j=0;j<source.length();j++)labels.add(source.optString(j));result.add(labels);}return result;}
    void practiceFormats(){
        String[] keys={"all","1","2","3","SE"},names={"All","1 blank","2 blanks","3 blanks","SE"};ArrayList<JSONObject> base=engine.s.practiceAll?new ArrayList<>(questions):dayQuestions(engine.s.practiceDay);
        for(int start=0;start<keys.length;start+=3){LinearLayout line=row();for(int offset=0;offset<3;offset++){int i=start+offset;if(i>=keys.length){line.addView(new Space(this),new LinearLayout.LayoutParams(0,dp(48),1));continue;}String key=keys[i];int count=0;for(JSONObject q:base)if(StudyEngine.formatMatches(q.optString("type"),q.optInt("blankCount"),key))count++;Button b=button(line,names[i]+" · "+count,()->{engine.s.practiceFilter=key;engine.s.practiceIndex=0;clearOfficial();save();render();},engine.s.practiceFilter.equals(key));b.setTextSize(14);b.setMinWidth(0);b.setMinimumWidth(0);b.setPadding(dp(4),dp(10),dp(4),dp(10));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);lp.setMargins(dp(2),dp(3),dp(2),dp(3));b.setLayoutParams(lp);}body.addView(line);}
    }
    void practicePicker(ArrayList<JSONObject> qs){Spinner spinner=new Spinner(this);ArrayList<String> labels=new ArrayList<>();for(JSONObject q:qs)labels.add(q.optString("id")+" · "+q.optString("type")+" · "+q.optInt("blankCount")+" blank"+(q.optInt("blankCount")>1?"s":""));ArrayAdapter<String> adapter=new ArrayAdapter<String>(this,android.R.layout.simple_spinner_item,labels){@Override public View getView(int pos,View reuse,android.view.ViewGroup parent){TextView v=(TextView)super.getView(pos,reuse,parent);v.setTextColor(fg);v.setTextSize(16);v.setPadding(dp(8),dp(12),dp(8),dp(12));return v;}};adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);spinner.setAdapter(adapter);int selected=engine.s.practiceIndex;spinner.setSelection(selected);spinner.setMinimumHeight(dp(52));body.addView(spinner);spinner.setContentDescription("Choose supplied question by number, type and blank count");spinner.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){public void onItemSelected(android.widget.AdapterView<?> parent,View view,int pos,long id){if(pos!=selected){engine.s.practiceIndex=pos;clearOfficial();save();render();}}public void onNothingSelected(android.widget.AdapterView<?> p){}});}
    void officialOptions(LinearLayout parent,JSONObject q){LinearLayout choices=column();parent.addView(choices);renderOfficialChoices(choices,q);}
    void renderOfficialChoices(LinearLayout parent,JSONObject q){
        parent.removeAllViews();JSONArray choices=q.optJSONArray("choices");String mode=q.optString("selectionMode");ArrayList<ArrayList<String>> groups=questionGroups(q),display=new ArrayList<>(groups);
        if(display.isEmpty()){ArrayList<String> all=new ArrayList<>();for(int i=0;i<choices.length();i++)all.add(choices.optJSONObject(i).optString("label"));display.add(all);}
        for(int index=0;index<display.size();index++){space(parent,16);eyebrow(parent,mode.equals("multiBlank")?"Blank "+(index+1):mode.equals("pair")?"Choose one pair for both blanks":mode.equals("multiSelect")?"Select two answers":"Choose one answer");
            for(String label:display.get(index)){JSONObject opt=null;for(int i=0;i<choices.length();i++)if(choices.optJSONObject(i).optString("label").equals(label))opt=choices.optJSONObject(i);if(opt==null)continue;boolean selected=engine.s.officialSelection.contains(label);Button b=button(parent,(selected?"✓ ":"")+label+". "+opt.optString("text"),()->{if(engine.s.officialFeedback)return;if(mode.equals("multiSelect")&&!engine.s.officialSelection.contains(label)&&engine.s.officialSelection.size()>=2){Toast.makeText(this,"Select two answers. Tap a selected answer to change it.",Toast.LENGTH_SHORT).show();return;}StudyEngine.selectChoice(engine.s.officialSelection,mode,groups,label,!mode.equals("multiSelect")||!engine.s.officialSelection.contains(label));save();if(StudyEngine.selectionComplete(engine.s.officialSelection,q.optJSONArray("answers").length(),groups))gradeOfficial(q);else renderOfficialChoices(parent,q);},selected);b.setGravity(Gravity.LEFT|Gravity.CENTER_VERTICAL);b.setSelected(selected);b.setTextSize(18);b.setEnabled(!engine.s.officialFeedback);b.setContentDescription(label+". "+opt.optString("text")+(selected?", selected":""));}
        }
    }
    void practice(){
        heading("OFFICIAL GRE PRACTICE","Think in context.","Filter by day and number of blanks, or browse the full supplied bank.");
        CheckBox all=new CheckBox(this);all.setText("All supplied questions");all.setTextSize(17);all.setTextColor(fg);all.setMinHeight(dp(48));all.setButtonTintList(android.content.res.ColorStateList.valueOf(accent));all.setChecked(engine.s.practiceAll);body.addView(all);all.setOnCheckedChangeListener((b,checked)->{engine.s.practiceAll=checked;engine.s.practiceIndex=0;clearOfficial();save();render();});
        Spinner day=dayPicker(body,engine.s.practiceDay,n->{engine.s.practiceDay=n;engine.s.practiceIndex=0;clearOfficial();save();render();});day.setEnabled(!engine.s.practiceAll);practiceFormats();ArrayList<JSONObject> qs=practiceQuestions();
        if(qs.isEmpty()){LinearLayout c=card(body);addText(c,"No supplied questions match this day and format.",22,fg);addText(c,"Choose another day, select All formats, or browse All supplied questions.",16,muted);return;}
        if(engine.s.practiceComplete){LinearLayout complete=card(body);addText(complete,"Practice complete.",24,accent);button(complete,"Review last answer",()->{engine.s.practiceComplete=false;engine.s.officialHoldFeedback=true;save();render();},false);button(complete,"Start this set again",()->{engine.s.practiceIndex=0;clearOfficial();save();render();},true);return;}
        engine.s.practiceIndex=Math.max(0,Math.min(qs.size()-1,engine.s.practiceIndex));JSONObject q=qs.get(engine.s.practiceIndex);
        addText(body,qs.size()+" supplied questions · "+(engine.s.practiceAll?"entire bank":"Day "+engine.s.practiceDay),15,muted);practicePicker(qs);
        LinearLayout c=card(body);eyebrow(c,q.optString("type")+" · "+q.optInt("blankCount")+" blank"+(q.optInt("blankCount")>1?"s":"")+" · "+(engine.s.practiceIndex+1)+" / "+qs.size());addText(c,plain(q.optString("stem")),18,fg);officialOptions(c,q);
        JSONArray answers=q.optJSONArray("answers");
        if(engine.s.officialFeedback){
            boolean correct=selectedCorrect(answers);LinearLayout feedback=card(body);addText(feedback,answers.length()==0?"Answer key not provided in source":correct?"✓ Correct":"✕ Review the supplied answer",23,correct?accent:error);if(!engine.s.officialHoldFeedback)button(feedback,"Stay on this answer",()->{engine.s.officialHoldFeedback=true;cancelAdvance();save();render();},false);revealFeedback(feedback);addText(feedback,plain(q.optString("answerSource")),17,fg);String explanation=q.optString("explanation");addText(feedback,explanation.isEmpty()?"Explanation not provided in source":plain(explanation),16,fg);
            JSONArray linked=q.optJSONArray("linkedWords");for(int i=0;i<linked.length();i++){String wid=linked.optString(i);button(feedback,"Explore "+engine.byId.get(wid).term+" →",()->wordDialog(wid),false);}
            button(feedback,"View complete verbatim source record",()->sourceDialog(q.optString("id")+" · Supplied record",q.optString("raw")),false);
        }
        LinearLayout arrows=row();body.addView(arrows);Button prev=button(arrows,"Previous question",()->moveOfficial(-1),false),next=button(arrows,"Next question",()->moveOfficial(1),false);prev.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1));next.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1));prev.setEnabled(engine.s.practiceIndex>0);next.setEnabled(engine.s.practiceIndex<qs.size()-1);
        button(body,"Redo this supplied question",()->{clearOfficial();save();render();},false);addText(body,"Practice attempts save separately. They never increase the 45-word daily count or change spaced-review scheduling.",12,muted);
    }
    void clearOfficial(){engine.s.officialSelection.clear();engine.s.officialFeedback=false;engine.s.officialHoldFeedback=false;engine.s.practiceComplete=false;}
    boolean selectedCorrect(JSONArray answers){HashSet<String> expected=new HashSet<>();for(int i=0;i<answers.length();i++)expected.add(answers.optString(i));return !expected.isEmpty()&&engine.s.officialSelection.equals(expected);}
    void gradeOfficial(JSONObject q){
        if(engine.s.officialFeedback)return;
        JSONArray answers=q.optJSONArray("answers");if(answers.length()>0&&!StudyEngine.selectionComplete(engine.s.officialSelection,answers.length(),questionGroups(q))){Toast.makeText(this,q.optString("selectionMode").equals("multiBlank")?"Choose one answer for every blank.":"Select exactly "+answers.length()+" answer"+(answers.length()>1?"s":"")+" as the source requests.",Toast.LENGTH_SHORT).show();return;}
        String response=String.join(", ",new TreeSet<>(engine.s.officialSelection));boolean correct=selectedCorrect(answers);String qid=q.optString("id");
        boolean replay=!engine.s.practiceAll&&engine.s.practiceDay<engine.s.studyDay;int lessonDay=engine.s.practiceAll?engine.s.studyDay:engine.s.practiceDay;
        StudyEngine.Attempt attempt=engine.record("",response,"Official GRE",correct,replay,lessonDay,qid);attempt.expected=answers.toString();
        JSONArray ids=q.optJSONArray("linkedWords");for(int i=0;i<ids.length();i++){StudyEngine.Attempt a=engine.record(ids.optString(i),response,"Official GRE · "+q.optString("type"),correct,replay,lessonDay,qid);a.expected=answers.toString();}
        engine.s.officialFeedback=true;engine.s.officialHoldFeedback=false;save();render();
    }
    void moveOfficial(int delta){engine.s.practiceIndex+=delta;clearOfficial();save();render();}
    void progress(){
        heading("YOUR JOURNEY","Small steps.\nLasting words.","Your completion and foreground study time.");progressPanel(body);LinearLayout peak=card(body);peak.addView(new MountainView(),new LinearLayout.LayoutParams(-1,dp(230)));
        LinearLayout counts=card(body);addText(counts,engine.s.mastered.size()+" confirmations completed",24,fg);addText(counts,engine.scheduledDueNow().size()+" items due now · "+engine.s.due.size()+" in active schedule",16,muted);int practice=0;for(StudyEngine.Attempt a:engine.s.attempts)if(a.type.equals("Official GRE"))practice++;addText(counts,practice+" official question attempts · separate from new learning",15,muted);
        button(body,"Review queue →",()->go("review"),true);
        LinearLayout repetitions=card(body);eyebrow(repetitions,"MOST REPEATED FIRST");addText(repetitions,"One line per word. Longer lines mean more repeat days. The first day is not a repeat.",14,muted);List<StudyEngine.Word> studied=engine.repetitionWords();if(studied.isEmpty())addText(repetitions,"Study a word to begin your repetition history.",16,muted);int max=studied.isEmpty()?1:Math.max(1,engine.repeatDays(studied.get(0).id));for(StudyEngine.Word w:studied)repetitionRow(repetitions,w.id,max,true);

        LinearLayout mistakes=card(body);eyebrow(mistakes,"WORDS TO REVISIT · COMPLETE HISTORY");LinkedHashSet<String> ids=new LinkedHashSet<>();for(int i=engine.s.attempts.size()-1;i>=0;i--){StudyEngine.Attempt a=engine.s.attempts.get(i);if(!a.correct&&!a.wordId.isEmpty())ids.add(a.wordId);}if(ids.isEmpty())addText(mistakes,"No mistakes recorded yet. You can open any word’s history from Library.",16,muted);for(String id:ids)button(mistakes,engine.byId.get(id).term+" · history →",()->historyDialog(id),false);
    }
    void settings(){
        heading("MAKE IT YOURS","A quieter space.","Offline. Personal. Ready when you are.");LinearLayout c=card(body);eyebrow(c,"Appearance");button(c,(engine.s.theme.equals("dark")?"✓ ":"")+"☾ Dark",()->{engine.s.theme="dark";save();render();},engine.s.theme.equals("dark"));button(c,(engine.s.theme.equals("light")?"✓ ":"")+"☀ Light",()->{engine.s.theme="light";save();render();},engine.s.theme.equals("light"));
        LinearLayout focus=card(body);eyebrow(focus,"Focus timer");addText(focus,"60 minutes · foreground only",21,fg);addText(focus,"Starts once when you begin your active day’s plan. Pauses in the background and resumes from saved remaining time. At zero, keep studying or leave freely. There is no device lock.",16,muted);
        LinearLayout activity=card(body);eyebrow(activity,"Learn / Practice time");addText(activity,"Counts foreground flashcard time as Learn. Meaning, spelling, scheduled reviews and official GRE questions count as Practice. Pauses while away; Today, Library, Settings and Progress browsing are excluded. Time tracking starts with this update; earlier activity is not guessed.",15,muted);
        LinearLayout voice=card(body);eyebrow(voice,"Pronunciation");addText(voice,voiceReady?"Offline English voice ready":"Offline English voice unavailable or initializing",18,fg);addText(voice,"Only installed non-network English voices are used. Enable an offline voice in Android’s Text-to-speech settings if needed.",15,muted);button(voice,"Test pronunciation · "+engine.words.get(0).term,()->speak(engine.words.get(0).term),false);
        LinearLayout data=card(body);eyebrow(data,"Your content + state");addText(data,engine.words.size()+" words · "+questions.size()+" supplied questions",20,fg);addText(data,"Bundled study material and examples. No accounts, Internet permission or analytics. All state is private to this app on this device. Uninstalling removes local progress. Version 1.0.0 · schema 1.",14,muted);addText(data,"Study day advances when you finish the current day and choose Continue in Today. Spaced intervals use these explicit study days; elapsed calendar days never silently skip your plan.",14,muted);
    }
    String duration(long millis){long seconds=Math.max(0,millis/1000),minutes=seconds/60;return minutes>=60?(minutes/60)+"h "+(minutes%60)+"m":minutes>0?minutes+"m":seconds+"s";}
    int learnColor(){return col(engine.s.theme.equals("light")?"#356A9A":"#8BB9E8");}
    int practiceColor(){return col(engine.s.theme.equals("light")?"#9C496D":"#DFA4BB");}
    void progressPanel(LinearLayout parent){
        LinearLayout panel=card(parent);eyebrow(panel,"Completion & focus · Day "+engine.s.studyDay);LinearLayout columns=row();columns.setGravity(Gravity.TOP);LinearLayout completion=column(),time=column();LinearLayout.LayoutParams a=new LinearLayout.LayoutParams(0,-2,1),b=new LinearLayout.LayoutParams(0,-2,1);a.rightMargin=dp(5);b.leftMargin=dp(5);columns.addView(completion,a);columns.addView(time,b);panel.addView(columns);completion.addView(new ProgressCircle(false),new LinearLayout.LayoutParams(-1,dp(155)));time.addView(new ProgressCircle(true),new LinearLayout.LayoutParams(-1,dp(155)));
        List<StudyEngine.Word> day=engine.day(engine.s.studyDay);addText(completion,"● Overall  "+engine.total()+"/"+engine.words.size(),14,accent);addText(completion,day.isEmpty()?"● Daily  Review day":"● Daily  "+engine.count(day)+"/"+day.size(),14,warm);addText(time,"● Learn  "+duration(engine.usage("learn",engine.s.studyDay)),14,learnColor());addText(time,"● Practice  "+duration(engine.usage("practice",engine.s.studyDay)),14,practiceColor());
    }
    void cancelCarousel(){if(carouselTick!=null){handler.removeCallbacks(carouselTick);carouselTick=null;}}
    void scheduleCarousel(){cancelCarousel();if(engine==null||!foreground||!engine.s.screen.equals("today")||engine.s.carouselPaused||troubleContent==null||!android.animation.ValueAnimator.areAnimatorsEnabled()||engine.frequentMistakes().size()<2)return;carouselTick=()->{carouselTick=null;if(!foreground||!engine.s.screen.equals("today")||troubleContent==null)return;engine.s.mistakeSlideIndex++;renderTroubleWord();scheduleCarousel();};handler.postDelayed(carouselTick,4000);}
    void troubleCarousel(){LinearLayout panel=card(body);eyebrow(panel,"Words to remember");troubleContent=column();panel.addView(troubleContent);renderTroubleWord();}
    void renderTroubleWord(){
        if(troubleContent==null)return;troubleContent.removeAllViews();List<StudyEngine.Word> words=engine.frequentMistakes();if(words.isEmpty()){addText(troubleContent,"No mistakes yet. Your most missed words will appear here.",16,muted);return;}int size=Math.min(10,words.size());engine.s.mistakeSlideIndex=Math.floorMod(engine.s.mistakeSlideIndex,size);StudyEngine.Word word=words.get(engine.s.mistakeSlideIndex);addText(troubleContent,(engine.s.mistakeSlideIndex+1)+" / "+size+" · "+engine.errorCount(word.id)+" recorded mistakes",14,muted);TextView term=text(word.term,32,fg);troubleContent.addView(term);term.setTextIsSelectable(false);term.setOnClickListener(v->{engine.s.carouselPaused=true;cancelCarousel();save();renderTroubleWord();wordDialog(word.id);});addText(troubleContent,word.meaning,18,fg);LinearLayout controls=row();troubleContent.addView(controls);Button back=button(controls,"‹",()->{engine.s.mistakeSlideIndex--;renderTroubleWord();scheduleCarousel();},false),pause=button(controls,engine.s.carouselPaused?"Play":"Pause",()->{engine.s.carouselPaused=!engine.s.carouselPaused;save();renderTroubleWord();scheduleCarousel();},false),next=button(controls,"›",()->{engine.s.mistakeSlideIndex++;renderTroubleWord();scheduleCarousel();},false);for(Button b:new Button[]{back,pause,next})b.setLayoutParams(new LinearLayout.LayoutParams(0,dp(48),1));back.setContentDescription("Previous mistake word");next.setContentDescription("Next mistake word");SpringMotion.enter(troubleContent);
    }
    void streak(LinearLayout parent){LinearLayout line=row();line.addView(new StreakFlame(),new LinearLayout.LayoutParams(dp(38),dp(42)));int days=engine.currentStreak(java.time.LocalDate.now());line.addView(text(days+" day streak",17,warm),new LinearLayout.LayoutParams(0,-2,1));parent.addView(line);if(days==0)addText(parent,"Study today to begin",14,muted);}
    abstract class EntryView extends View {
        float phase=1;SpringMotion motion;
        EntryView(){super(MainActivity.this);}
        @Override protected void onAttachedToWindow(){super.onAttachedToWindow();motion=SpringMotion.animate(this,0,1,150,1,p->{phase=Math.max(0,Math.min(1,p));invalidate();});}
        @Override protected void onDetachedFromWindow(){if(motion!=null)motion.cancel();super.onDetachedFromWindow();}
    }
    class StreakFlame extends EntryView {
        Paint p=new Paint(3);StreakFlame(){setContentDescription("Study streak");}
        @Override protected void onDraw(Canvas c){super.onDraw(c);c.save();c.scale(getWidth()/38f,getHeight()/42f);float scale=.8f+.2f*phase;c.scale(scale,scale,19,23);p.setColor(warm);Path flame=new Path();flame.moveTo(19,3);flame.cubicTo(22,13,32,16,29,28);flame.cubicTo(26,40,8,39,7,27);flame.cubicTo(6,20,11,15,13,13);flame.cubicTo(11,23,19,20,19,3);c.drawPath(flame,p);p.setColor(bg);c.drawCircle(19,29,5,p);c.restore();}
    }
    class StartupView extends EntryView {
        Paint p=new Paint(3);StartupView(){setBackgroundColor(Color.rgb(16,19,35));setContentDescription("Preparing your offline word library");}
        @Override protected void onDraw(Canvas c){super.onDraw(c);float cx=getWidth()/2f,cy=getHeight()/2f;c.save();c.translate(cx-dp(70),cy-dp(90)+dp(12)*(1-phase));c.scale(dp(140)/140f,dp(140)/140f);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(2);p.setColor(Color.rgb(183,164,255));Path mountain=new Path();mountain.moveTo(5,110);mountain.lineTo(44,63);mountain.lineTo(63,85);mountain.lineTo(91,25);mountain.lineTo(135,110);c.drawPath(mountain,p);p.setColor(Color.rgb(237,188,135));p.setStyle(Paint.Style.FILL);c.drawCircle(48+phase*30,103-phase*48,4,p);c.restore();p.setColor(Color.WHITE);p.setTextAlign(Paint.Align.CENTER);p.setTextSize(24*getResources().getDisplayMetrics().scaledDensity);c.drawText("GRE Ascent",cx,cy+dp(60),p);p.setTextSize(16*getResources().getDisplayMetrics().scaledDensity);p.setColor(Color.rgb(170,170,195));c.drawText("Your next ascent.",cx,cy+dp(90),p);}
    }
    class ProgressCircle extends EntryView {
        final boolean time;final Paint p=new Paint(3);
        ProgressCircle(boolean time){super();this.time=time;List<StudyEngine.Word> day=engine.day(engine.s.studyDay);setContentDescription(time?"Day "+engine.s.studyDay+": Learn "+duration(engine.usage("learn",engine.s.studyDay))+", Practice "+duration(engine.usage("practice",engine.s.studyDay)):"Overall "+engine.total()+" of "+engine.words.size()+", daily "+engine.count(day)+" of "+day.size());setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);}
        void ring(Canvas canvas,float cx,float cy,float radius,float fraction,int color,float width){RectF rect=new RectF(cx-radius,cy-radius,cx+radius,cy+radius);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(width);p.setStrokeCap(Paint.Cap.ROUND);p.setColor(border);canvas.drawOval(rect,p);p.setColor(color);if(fraction>0)canvas.drawArc(rect,-90,360*fraction,false,p);}
        @Override protected void onDraw(Canvas canvas){super.onDraw(canvas);float cx=getWidth()/2f,cy=getHeight()/2f,r=Math.min(getWidth(),getHeight())*.42f;String center,caption;
            if(time){long learn=engine.usage("learn",engine.s.studyDay),practice=engine.usage("practice",engine.s.studyDay),total=learn+practice;ring(canvas,cx,cy,r-dp(4),0,learnColor(),dp(9));RectF rect=new RectF(cx-r+dp(4),cy-r+dp(4),cx+r-dp(4),cy+r-dp(4));float learnShare=StudyEngine.entryFraction(StudyEngine.fraction(learn,total),phase),practiceShare=StudyEngine.fraction(practice,total)*phase;p.setStrokeCap(Paint.Cap.BUTT);p.setColor(learnColor());if(learnShare>0)canvas.drawArc(rect,-90,360*learnShare,false,p);p.setColor(practiceColor());if(practiceShare>0)canvas.drawArc(rect,-90+360*learnShare,360*practiceShare,false,p);center=duration(total);caption="focus time";
            }else{List<StudyEngine.Word> day=engine.day(engine.s.studyDay);float daily=StudyEngine.fraction(engine.count(day),day.size());ring(canvas,cx,cy,r,StudyEngine.entryFraction(StudyEngine.fraction(engine.total(),engine.words.size()),phase),accent,dp(6));ring(canvas,cx,cy,Math.max(dp(10),r-dp(14)),StudyEngine.entryFraction(daily,phase),warm,dp(6));center=Math.round(daily*100)+"%";caption="today";}
            p.setStyle(Paint.Style.FILL);p.setTextAlign(Paint.Align.CENTER);float width=Math.max(dp(24),2*(r-dp(time?17:24)));float mainSize=18*getResources().getDisplayMetrics().scaledDensity,captionSize=11*getResources().getDisplayMetrics().scaledDensity;p.setTypeface(Typeface.create("sans-serif-medium",0));p.setTextSize(mainSize);if(p.measureText(center)>width)mainSize*=width/p.measureText(center);p.setTextSize(mainSize);Paint.FontMetrics main=p.getFontMetrics();p.setTypeface(Typeface.create("sans-serif",0));p.setTextSize(captionSize);if(p.measureText(caption)>width)captionSize*=width/p.measureText(caption);p.setTextSize(captionSize);Paint.FontMetrics sub=p.getFontMetrics();float height=main.descent-main.ascent+dp(4)+sub.descent-sub.ascent;float scale=Math.min(1,width/height);mainSize*=scale;captionSize*=scale;p.setTypeface(Typeface.create("sans-serif-medium",0));p.setTextSize(mainSize);main=p.getFontMetrics();p.setTypeface(Typeface.create("sans-serif",0));p.setTextSize(captionSize);sub=p.getFontMetrics();height=main.descent-main.ascent+dp(4)+sub.descent-sub.ascent;float mainY=cy-height/2-main.ascent;p.setTypeface(Typeface.create("sans-serif-medium",0));p.setTextSize(mainSize);p.setColor(fg);canvas.drawText(center,cx,mainY,p);p.setTypeface(Typeface.create("sans-serif",0));p.setTextSize(captionSize);p.setColor(muted);canvas.drawText(caption,cx,mainY+main.descent+dp(4)-sub.ascent,p);
        }
    }
    class MountainView extends EntryView {
        Paint paint=new Paint(3);
        MountainView(){super();setContentDescription("Vocabulary Mountain. "+engine.total()+" of "+engine.words.size()+" unique items completed.");setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);}
        void path(Canvas c,float[] coords,int color,boolean fill){Path p=new Path();p.moveTo(coords[0],coords[1]);for(int i=2;i<coords.length;i+=2)p.lineTo(coords[i],coords[i+1]);if(fill)p.close();paint.setColor(color);paint.setStyle(fill?Paint.Style.FILL:Paint.Style.STROKE);paint.setStrokeWidth(1.2f);c.drawPath(p,paint);}
        @Override protected void onDraw(Canvas canvas){super.onDraw(canvas);canvas.save();canvas.scale(getWidth()/340f,getHeight()/200f);canvas.translate(0,12*(1-phase));canvas.saveLayerAlpha(0,0,340,200,(int)(255*phase));
            boolean light=engine.s.theme.equals("light");path(canvas,new float[]{0,185,68,95,110,131,179,21,237,114,283,67,340,185},col(light?"#E1DAF0":"#262B49"),true);path(canvas,new float[]{30,185,111,109,158,146,214,68,320,185},col(light?"#C7BAE2":"#3B375D"),true);path(canvas,new float[]{0,185,68,95,110,131,179,21,237,114,283,67,340,185},accent,false);
            Path trail=new Path();trail.moveTo(43,177);trail.cubicTo(130,170,172,125,179,22);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(2.5f);paint.setColor(warm);paint.setPathEffect(new DashPathEffect(new float[]{2,6},0));canvas.drawPath(trail,paint);paint.setPathEffect(null);
            float ratio=engine.total()/(float)Math.max(1,engine.words.size());PathMeasure measure=new PathMeasure(trail,false);float[] pos=new float[2];measure.getPosTan(measure.getLength()*ratio,pos,null);paint.setStyle(Paint.Style.FILL);paint.setColor(accent);canvas.drawCircle(pos[0],pos[1],9,paint);paint.setColor(warm);canvas.drawCircle(pos[0],pos[1],5,paint);
            path(canvas,new float[]{169,39,179,21,192,44,180,36},fg,true);paint.setColor(muted);paint.setTextSize(10);canvas.drawText(engine.words.size()+" WORDS",218,30,paint);canvas.restore();canvas.restore();
        }
    }
}
