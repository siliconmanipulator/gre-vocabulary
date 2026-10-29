package com.greascent.app;

import java.io.*;
import java.time.LocalDate;
import java.time.Instant;
import java.util.*;

/** Android-independent state machine. All mutations are saved by the owning Activity. */
public final class StudyEngine {
    public static final class Word implements Serializable {
        private static final long serialVersionUID=1L;
        public String id,term,meaning;
        public int order;
        public HashSet<String> families=new HashSet<>();
        public Word(String id,String term,String meaning,int order){this.id=id;this.term=term;this.meaning=meaning;this.order=order;}
        public int day(){return order/45+1;}
        public int block(){return (order%45)/15+1;}
    }
    public static final class Due implements Serializable {
        private static final long serialVersionUID=1L;
        public int day,lastErrorDay;
        public String stage;
        public Due(int d,String s,int err){day=d;stage=s;lastErrorDay=err;}
    }
    public static final class Attempt implements Serializable {
        private static final long serialVersionUID=1L;
        public String wordId,response,expected,type,date,timestamp,questionId="";
        public int day,lessonDay,number;
        public boolean correct,replay;
    }
    public static final class ScheduleEvent implements Serializable {
        private static final long serialVersionUID=1L;
        public int day,due;
        public String reason;
        ScheduleEvent(int day,int due,String reason){this.day=day;this.due=due;this.reason=reason;}
    }
    public static final class Session implements Serializable {
        private static final long serialVersionUID=1L;
        public String mode="new";
        public int lessonDay,block,cardIndex,index,coreCount;
        public boolean quiz=false,revealed=false,feedback=false,correct=false;
        public boolean holdFeedback=false;
        public String draft="",response="";
        public ArrayList<String> cards=new ArrayList<>(),queue=new ArrayList<>();
        public HashSet<String> retried=new HashSet<>();
        public HashSet<String> replayIds=new HashSet<>();
    }
    public static final class State implements Serializable {
        private static final long serialVersionUID=1L;
        public int schema=1,studyDay=1;
        public String theme="dark",screen="today",practiceDraft="";
        public int libraryDay=1,practiceDay=1,practiceIndex=0;
        public String practiceFilter="all";
        public boolean practiceAll=false;
        public boolean meaningsVisible=false;
        public HashMap<Integer,Long> learningMillis=new HashMap<>(),practiceMillis=new HashMap<>();
        public HashMap<String,HashSet<Integer>> studiedDays=new HashMap<>();
        public HashSet<String> activeDates=new HashSet<>();
        public HashMap<String,Integer> previousMistakesHandled=new HashMap<>();
        public HashMap<String,Integer> retentionDueDay=new HashMap<>(),retentionLevel=new HashMap<>();
        public int reviewShuffleCounter=0,mistakeSlideIndex=0;
        public boolean carouselPaused=false;
        public boolean officialHoldFeedback=false,practiceComplete=false;
        public HashSet<String> seen=new HashSet<>(),coreDone=new HashSet<>(),mastered=new HashSet<>();
        public HashMap<String,String> confidence=new HashMap<>();
        public HashMap<String,Due> due=new HashMap<>();
        public HashMap<String,ArrayList<ScheduleEvent>> scheduleLog=new HashMap<>();
        public HashMap<Integer,Long> timers=new HashMap<>();
        public HashSet<Integer> revisited=new HashSet<>();
        public ArrayList<Attempt> attempts=new ArrayList<>();
        public Session session;
        public HashMap<String,Session> savedSessions=new HashMap<>();
        public HashSet<String> officialSelection=new HashSet<>();
        public boolean officialFeedback=false;
    }
    public final List<Word> words;
    public final Map<String,Word> byId=new LinkedHashMap<>();
    public final State s;
    public StudyEngine(List<Word> words,State state){
        this.words=Collections.unmodifiableList(new ArrayList<>(words));s=state;
        for(Word w:words){if(byId.put(w.id,w)!=null)throw new IllegalArgumentException("Duplicate word ID "+w.id);}
        if(s.schema!=1)throw new IllegalStateException("Unsupported state schema "+s.schema+". Your saved file has been preserved.");
        if(s.practiceFilter==null)s.practiceFilter="all"; // Additive schema-1 state compatibility.
        if(s.learningMillis==null)s.learningMillis=new HashMap<>();
        if(s.practiceMillis==null)s.practiceMillis=new HashMap<>();
        if(s.studiedDays==null)s.studiedDays=new HashMap<>();
        if(s.activeDates==null)s.activeDates=new HashSet<>();
        if(s.previousMistakesHandled==null)s.previousMistakesHandled=new HashMap<>();
        if(s.retentionDueDay==null)s.retentionDueDay=new HashMap<>();
        if(s.retentionLevel==null)s.retentionLevel=new HashMap<>();
        for(Attempt a:s.attempts)noteActivityDate(a.date);
        // Recover only evidenced learning days. Linked official-question records are not word study.
        for(Attempt a:s.attempts)if(!a.type.startsWith("Official GRE"))noteStudy(a.wordId,a.day);
        for(String id:s.mastered)if(!s.retentionDueDay.containsKey(id)){int masteredDay=s.studyDay;ArrayList<ScheduleEvent> events=s.scheduleLog.get(id);if(events!=null)for(ScheduleEvent event:events)if(event.reason.equals("mastered"))masteredDay=event.day;s.retentionDueDay.put(id,masteredDay+7);}
        if(s.session!=null&&s.session.revealed)s.meaningsVisible=true;
    }
    public int dayCount(){return (words.size()+44)/45;}
    public List<Word> day(int day){ArrayList<Word> list=new ArrayList<>();for(Word w:words)if(w.day()==day)list.add(w);return list;}
    public List<Word> block(int day,int block){ArrayList<Word> list=new ArrayList<>();for(Word w:day(day))if(w.block()==block)list.add(w);return list;}
    public boolean completed(String id){return s.seen.contains(id)&&s.coreDone.contains(id);}
    public int count(Collection<Word> list){int n=0;for(Word w:list)if(completed(w.id))n++;return n;}
    public int total(){return count(words);}
    public boolean dayComplete(int day){List<Word> ws=day(day);return !ws.isEmpty()&&count(ws)==ws.size();}
    public String status(int day){if(s.revisited.contains(day))return dayComplete(day)?"Complete · revisited":"In progress · revisited";int n=count(day(day));return n==0?"Not started":dayComplete(day)?"Complete":"In progress";}
    public List<String> dueNow(){ArrayList<String> out=new ArrayList<>();for(Word w:words){Due d=s.due.get(w.id);if(d!=null&&d.day<=s.studyDay)out.add(w.id);}return out;}
    public List<String> pendingPreviousMistakes(){
        HashMap<String,Integer> wrong=new HashMap<>(),correct=new HashMap<>();
        for(Attempt a:s.attempts){if(a.replay||a.day>=s.studyDay||!byId.containsKey(a.wordId)||a.type.startsWith("Official GRE"))continue;
            if(!a.correct)wrong.put(a.wordId,Math.max(wrong.getOrDefault(a.wordId,0),a.day));
            else if(!a.type.startsWith("Retry"))correct.put(a.wordId,Math.max(correct.getOrDefault(a.wordId,0),a.day));
        }
        ArrayList<String> result=new ArrayList<>();for(Word w:words){int day=wrong.getOrDefault(w.id,0);if(day>0&&day>s.previousMistakesHandled.getOrDefault(w.id,0)&&correct.getOrDefault(w.id,0)<=day)result.add(w.id);}return result;
    }
    public List<String> scheduledDueNow(){ArrayList<String> result=new ArrayList<>(dueNow());result.removeAll(pendingPreviousMistakes());return result;}
    private void shuffleReview(Session x){s.reviewShuffleCounter++;Collections.shuffle(x.cards,new Random(7919L*s.reviewShuffleCounter+s.studyDay));x.queue.clear();x.queue.addAll(x.cards);}
    public void startPreviousMistakes(){
        String key="previous:"+s.studyDay;Session previous=s.savedSessions.get(key);if(previous!=null&&previous.index<previous.queue.size()){s.session=previous;s.screen="learn";return;}
        Session x=new Session();x.mode="previous";x.lessonDay=s.studyDay;x.quiz=true;x.cards.addAll(pendingPreviousMistakes());shuffleReview(x);x.coreCount=x.cards.size();s.session=x;s.savedSessions.put(key,x);s.screen="learn";
    }
    public List<String> retentionDue(){ArrayList<String> ids=new ArrayList<>();for(Word w:words)if(s.mastered.contains(w.id)&&!s.due.containsKey(w.id)&&s.retentionDueDay.getOrDefault(w.id,Integer.MAX_VALUE)<=s.studyDay)ids.add(w.id);return ids;}
    public void startRetention(){String key="retention:"+s.studyDay;Session old=s.savedSessions.get(key);if(old!=null&&old.index<old.queue.size()){s.session=old;s.screen="learn";return;}Session x=new Session();x.mode="retention";x.lessonDay=s.studyDay;x.quiz=true;List<String> due=retentionDue();x.cards.addAll(due.subList(0,Math.min(10,due.size())));shuffleReview(x);x.coreCount=x.cards.size();s.session=x;s.savedSessions.put(key,x);s.screen="learn";}
    public int errorCount(String id){int count=0;for(Attempt a:s.attempts)if(a.wordId.equals(id)&&!a.correct)count++;return count;}
    public List<Word> frequentMistakes(){HashMap<String,Integer> counts=new HashMap<>();for(Attempt a:s.attempts)if(!a.correct&&byId.containsKey(a.wordId))counts.put(a.wordId,counts.getOrDefault(a.wordId,0)+1);ArrayList<Word> list=new ArrayList<>();for(Word w:words)if(counts.containsKey(w.id))list.add(w);Collections.sort(list,(a,b)->{int n=Integer.compare(counts.get(b.id),counts.get(a.id));return n!=0?n:Integer.compare(a.order,b.order);});return list;}
    private void schedule(String id,int due,String stage,int err){s.due.put(id,new Due(due,stage,err));s.mastered.remove(id);s.scheduleLog.computeIfAbsent(id,k->new ArrayList<>()).add(new ScheduleEvent(s.studyDay,due,stage));}
    public void confidence(String id,boolean confident,boolean replay){
        noteStudy(id,s.studyDay);
        noteActivityDate(LocalDate.now().toString());
        if(replay)return;
        s.seen.add(id);s.confidence.put(id,confident?"Confident":"Needs revision");
        if(!confident)schedule(id,s.studyDay+1,"relearn",s.studyDay);
        else if(!s.due.containsKey(id)&&!s.mastered.contains(id))schedule(id,s.studyDay+2,"initial confirmation",0);
    }
    public void startBlock(int day,int block){
        if(day>s.studyDay)throw new IllegalArgumentException("Browse future words in Library; begin them when their study day is active.");
        if(day==s.studyDay&&!pendingPreviousMistakes().isEmpty()){startPreviousMistakes();return;}
        Session x=new Session();x.lessonDay=day;x.block=block;x.revealed=s.meaningsVisible;
        List<Word> list=block(day,block);if(list.isEmpty())throw new IllegalArgumentException("Empty block");
        x.mode=day<s.studyDay||count(list)==list.size()?"replay":"new";
        if(x.mode.equals("replay"))s.revisited.add(day);
        String key=x.mode+":"+day+":"+block;
        Session previous=s.savedSessions.get(key);
        if(previous!=null&&previous.index<previous.queue.size()){s.session=previous;s.session.revealed=s.meaningsVisible;s.screen="learn";return;}
        for(Word w:list){x.cards.add(w.id);if(s.coreDone.contains(w.id))x.replayIds.add(w.id);}
        x.queue.addAll(x.cards);x.coreCount=x.cards.size();s.session=x;s.savedSessions.put(key,x);
        if(x.mode.equals("new"))s.timers.putIfAbsent(s.studyDay,3600000L);
        s.screen="learn";
    }
    public void startReview(){
        String key="review:"+s.studyDay;Session previous=s.savedSessions.get(key);
        if(previous!=null&&previous.index<previous.queue.size()){
            HashSet<String> pending=new HashSet<>(pendingPreviousMistakes());
            for(int i=previous.queue.size()-1;i>=previous.index;i--)if(!(i==previous.index&&previous.feedback)&&pending.contains(previous.queue.get(i))){previous.queue.remove(i);if(i<previous.coreCount)previous.coreCount--;}
            if(previous.index<previous.queue.size()){s.session=previous;s.screen="learn";return;}
        }
        Session x=new Session();x.mode="review";x.lessonDay=s.studyDay;x.cards.addAll(scheduledDueNow());shuffleReview(x);x.coreCount=x.cards.size();x.quiz=true;s.session=x;s.savedSessions.put(key,x);s.screen="learn";
    }
    public void beginQuiz(){s.session.quiz=true;s.session.feedback=false;s.session.draft="";}
    public boolean canQuiz(){Session x=s.session;return x.mode.equals("replay")||!x.mode.equals("new")||s.seen.containsAll(x.cards);}
    public String current(){Session x=s.session;return x.quiz?x.queue.get(x.index):x.cards.get(x.cardIndex);}
    public void jumpCard(int position){Session x=s.session;if(x==null||x.quiz||position<0||position>=x.cards.size())return;x.cardIndex=position;x.revealed=s.meaningsVisible;}
    public void showMeanings(boolean show){s.meaningsVisible=show;if(s.session!=null)s.session.revealed=show;for(Session session:s.savedSessions.values())session.revealed=show;}
    public String activity(){if(s.screen.equals("practice"))return s.practiceComplete?"none":"practice";Session x=s.session;if(!s.screen.equals("learn")||x==null||x.cards.isEmpty()||(x.quiz&&x.index>=x.queue.size()))return "none";return x.quiz?"practice":"learn";}
    public void recordUsage(long elapsed,boolean foreground){if(!foreground||elapsed<=0)return;String kind=activity();Map<Integer,Long> bucket=kind.equals("learn")?s.learningMillis:kind.equals("practice")?s.practiceMillis:null;if(bucket!=null)bucket.put(s.studyDay,bucket.getOrDefault(s.studyDay,0L)+elapsed);}
    public long usage(String kind,int day){return (kind.equals("learn")?s.learningMillis:s.practiceMillis).getOrDefault(day,0L);}
    public void noteStudy(String id,int day){if(byId.containsKey(id)&&day>0)s.studiedDays.computeIfAbsent(id,k->new HashSet<>()).add(day);}
    public int studyDays(String id){HashSet<Integer> days=s.studiedDays.get(id);return days==null?0:days.size();}
    public int repeatDays(String id){return Math.max(0,studyDays(id)-1);}
    public void noteActivityDate(String date){try{if(date!=null)s.activeDates.add(LocalDate.parse(date).toString());}catch(java.time.format.DateTimeParseException ignored){}}
    public int currentStreak(LocalDate today){LocalDate day=s.activeDates.contains(today.toString())?today:today.minusDays(1);int count=0;while(s.activeDates.contains(day.toString())){count++;day=day.minusDays(1);}return count;}
    public static float entryFraction(float actual,float phase){float target=Math.max(0,Math.min(1,actual)),t=Math.max(0,Math.min(1,phase));return 1+(target-1)*t;}
    public List<Word> repetitionWords(){ArrayList<Word> list=new ArrayList<>();for(Word w:words)if(studyDays(w.id)>0)list.add(w);Collections.sort(list,(a,b)->{int n=Integer.compare(studyDays(b.id),studyDays(a.id));return n!=0?n:Integer.compare(a.order,b.order);});return list;}
    public static float fraction(long n,long total){return total<=0?0:Math.max(0,Math.min(1,n/(float)total));}
    public static boolean formatMatches(String type,int blankCount,String filter){return filter.equals("all")||(filter.equals("SE")?type.equals("SE"):!type.equals("SE")&&Integer.toString(blankCount).equals(filter));}
    public static void selectChoice(Set<String> selected,String mode,List<? extends Collection<String>> groups,String label,boolean checked){
        if(!checked){selected.remove(label);return;}
        if(mode.equals("multiBlank")){for(Collection<String> group:groups)if(group.contains(label)){selected.removeAll(group);break;}}
        else if(!mode.equals("multiSelect"))selected.clear();
        selected.add(label);
    }
    public static boolean selectionComplete(Set<String> selected,int required,List<? extends Collection<String>> groups){if(selected.size()!=required)return false;for(Collection<String> group:groups){int count=0;for(String label:group)if(selected.contains(label))count++;if(count!=1)return false;}return true;}
    public boolean isRetry(){Session x=s.session;return x.index>=x.coreCount;}
    public String format(){Session x=s.session;if(x.mode.equals("previous")||x.mode.equals("retention"))return "Meaning MCQ";boolean mcq=x.index%2==0;if(isRetry()){int original=x.cards.indexOf(x.queue.get(x.index));mcq=original%2!=0;}return mcq?"Meaning MCQ":"Spelling recall";}
    public List<Word> options(String id){
        Word target=byId.get(id);ArrayList<Word> options=new ArrayList<>();options.add(target);
        HashSet<String> terms=new HashSet<>();terms.add(target.term);
        int start=(target.order+17)%words.size();
        for(int j=0;j<words.size()&&options.size()<4;j++){
            Word w=words.get((start+j)%words.size());
            // Avoid the same definition or a linked family (handled by Activity's full family data too).
            if(!w.meaning.equals(target.meaning)&&Collections.disjoint(w.families,target.families)&&terms.add(w.term))options.add(w);
        }
        if(s.session!=null&&(s.session.mode.equals("review")||s.session.mode.equals("previous")||s.session.mode.equals("retention")))Collections.shuffle(options,new Random(s.reviewShuffleCounter*31L+target.order+s.studyDay*17L));else Collections.rotate(options,target.order%Math.max(1,options.size()));return options;
    }
    public static boolean spelling(String actual,String expected){return actual.trim().equalsIgnoreCase(expected);}
    public Attempt record(String id,String response,String type,boolean correct,boolean replay,int lessonDay,String qid){
        if(!type.startsWith("Official GRE"))noteStudy(id,s.studyDay);
        Attempt a=new Attempt();a.wordId=id;a.response=response;a.expected=byId.containsKey(id)?byId.get(id).term:"";a.type=type;a.correct=correct;a.replay=replay;a.day=s.studyDay;a.lessonDay=lessonDay;a.date=LocalDate.now().toString();a.timestamp=Instant.now().toString();a.questionId=qid;
        noteActivityDate(a.date);
        a.number=1;for(Attempt old:s.attempts)if(old.wordId.equals(id)&&old.questionId.equals(qid))a.number++;
        s.attempts.add(a);return a;
    }
    public void grade(String id,boolean correct,boolean replay,boolean retry){
        if(replay)return;
        Due old=s.due.get(id);
        if(!correct){schedule(id,s.studyDay+1,"relearn",s.studyDay);return;}
        // An immediate correct retry never clears or pushes out a same-day error.
        if(retry||(old!=null&&old.lastErrorDay==s.studyDay))return;
        if(old==null){if(!s.mastered.contains(id))schedule(id,s.studyDay+2,"initial confirmation",0);return;}
        if(old.day>s.studyDay)return;
        if(old.stage.equals("relearn"))schedule(id,s.studyDay+2,"confirmation",old.lastErrorDay);
        else {s.due.remove(id);s.mastered.add(id);s.retentionLevel.put(id,0);s.retentionDueDay.put(id,s.studyDay+7);s.scheduleLog.computeIfAbsent(id,k->new ArrayList<>()).add(new ScheduleEvent(s.studyDay,0,"mastered"));}
    }
    public void answer(String response){
        Session x=s.session;if(x.feedback||x.index>=x.queue.size())return;
        String id=current();Word w=byId.get(id);boolean retry=isRetry();
        boolean replay=x.mode.equals("replay")||x.replayIds.contains(id);
        boolean correct=spelling(response,w.term);
        record(id,response,(retry?"Retry · ":x.mode.equals("previous")?"Previous mistakes · ":x.mode.equals("retention")?"Keep it fresh · ":x.mode.equals("review")?"Scheduled review · ":"")+format(),correct,replay,x.lessonDay,"");
        if(x.mode.equals("previous"))s.previousMistakesHandled.put(id,s.studyDay-1);
        if(x.mode.equals("new")&&!retry&&!replay)s.coreDone.add(id);
        if(x.mode.equals("retention")){if(correct){int level=s.retentionLevel.getOrDefault(id,0)+1;int[] intervals={7,14,30,60};s.retentionLevel.put(id,level);s.retentionDueDay.put(id,s.studyDay+intervals[Math.min(level,intervals.length-1)]);}else{schedule(id,s.studyDay+1,"relearn",s.studyDay);s.retentionDueDay.remove(id);s.retentionLevel.remove(id);}}
        else grade(id,correct,replay,retry);
        if(!x.mode.equals("previous")&&!x.mode.equals("retention")&&!correct&&x.retried.add(id))x.queue.add(id);
        x.correct=correct;x.response=response;x.feedback=true;x.holdFeedback=false;x.draft="";
    }
    public boolean nextQuestion(){Session x=s.session;if(!x.feedback)return false;x.index++;x.feedback=false;x.draft="";x.response="";return x.index>=x.queue.size();}
    public void advanceDay(){if(s.studyDay<=dayCount()&&!dayComplete(s.studyDay))throw new IllegalStateException("Complete this day's new word checks first.");s.studyDay++;s.session=null;s.screen="today";}
    public boolean consumeFocus(long elapsedMillis,boolean foreground){Long remaining=s.timers.get(s.studyDay);if(!foreground||remaining==null||remaining==0)return false;long left=Math.max(0,remaining-Math.max(0,elapsedMillis));s.timers.put(s.studyDay,left);return left==0;}
    public String historyStatus(String id,int day){
        ArrayList<ScheduleEvent> events=s.scheduleLog.get(id);ScheduleEvent latest=null;
        if(events!=null)for(ScheduleEvent event:events)if(event.day<day)latest=event;
        return latest!=null&&latest.due>0&&latest.due<=day?"Scheduled · no attempt recorded":"Not scheduled · no attempt";
    }
    public static void save(State s,File target)throws IOException{
        File parent=target.getParentFile();if(parent!=null)parent.mkdirs();
        File tmp=new File(target.getPath()+".tmp");
        try(FileOutputStream file=new FileOutputStream(tmp);ObjectOutputStream out=new ObjectOutputStream(file)){out.writeObject(s);out.flush();file.getFD().sync();}
        java.nio.file.Files.move(tmp.toPath(),target.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING,java.nio.file.StandardCopyOption.ATOMIC_MOVE);
    }
    public static State load(File target)throws IOException,ClassNotFoundException{
        if(!target.exists())return new State();
        try(ObjectInputStream in=new ObjectInputStream(new FileInputStream(target))){State s=(State)in.readObject();if(s.schema!=1)throw new IOException("Unsupported state schema "+s.schema+"; data preserved");return s;}
    }
}
