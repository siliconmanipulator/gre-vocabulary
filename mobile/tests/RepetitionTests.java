import com.greascent.app.StudyEngine;
import java.util.*;
import java.io.*;
public class RepetitionTests {
    static int checks;
    static void check(boolean ok,String message){checks++;if(!ok)throw new AssertionError(message);}
    static List<StudyEngine.Word> words(){List<StudyEngine.Word> ws=new ArrayList<>();for(int i=0;i<46;i++)ws.add(new StudyEngine.Word("w"+i,"term"+i,"source definition "+i,i));return ws;}
    public static void main(String[] args)throws Exception{
        if(args.length>0){StudyEngine e=new StudyEngine(words(),StudyEngine.load(new File(args[1])));
            if(args[0].equals("legacy")){check(e.studyDays("w0")==1,"recover actual prior learning attempt day");check(e.studyDays("w1")==0,"do not invent missing historical study days");check(e.repeatDays("w0")==0,"first day is not a repeat");}
            else{check(e.studyDays("w0")==3&&e.repeatDays("w0")==2,"distinct day counts survive fresh process");check(e.studyDays("w1")==2,"other word counter survives");check(e.repetitionWords().get(0).id.equals("w0"),"descending order survives reload");}
            System.out.println("Repetition "+args[0]+": "+checks+" assertions passed");return;
        }
        StudyEngine e=new StudyEngine(words(),new StudyEngine.State());check(e.repetitionWords().isEmpty(),"empty history has no invented rows");
        e.startBlock(1,1);e.jumpCard(5);e.showMeanings(true);check(e.studyDays("w5")==0,"browsing and reveal alone do not count as study");
        for(int i=0;i<8;i++)e.confidence("w0",true,false);e.record("w0","wrong","Meaning MCQ",false,false,1,"");e.record("w0","term0","Retry · Spelling recall",true,false,1,"");
        check(e.studyDays("w0")==1&&e.repeatDays("w0")==0,"multiple confidence, quiz and retry events on same day count once");
        int total=e.total(),due=e.s.due.get("w0").day;e.s.studyDay=2;e.confidence("w0",false,true);e.record("w0","term0","Spelling recall",true,true,1,"");
        check(e.studyDays("w0")==2&&e.repeatDays("w0")==1,"old lesson replay counts current study day once");check(e.total()==total&&e.s.due.get("w0").day==due,"repetition counts do not alter completion or due schedule");
        e.record("w1","term1","Scheduled review · Meaning MCQ",true,false,2,"");check(e.studyDays("w1")==1,"scheduled review creates evidenced day");
        e.s.studyDay=3;e.record("w0","term0","Scheduled review · Spelling recall",true,false,3,"");e.confidence("w1",true,true);e.confidence("w2",true,true);e.noteStudy("unknown",3);e.noteStudy("w3",0);
        check(e.studyDays("w0")==3&&e.repeatDays("w0")==2,"three days yield two repeat days");check(e.studyDays("unknown")==0&&e.studyDays("w3")==0,"unknown IDs and nonpositive days ignored");
        e.record("w4","A","Official GRE · TC",true,false,3,"q1");e.record("","A","Official GRE",true,false,3,"q1");check(e.studyDays("w4")==0,"linked official practice never creates word-study days");
        check(e.repetitionWords().get(0).id.equals("w0")&&e.repetitionWords().get(1).id.equals("w1"),"most repeated words sorted first");e.confidence("w3",true,true);check(e.repetitionWords().get(2).id.equals("w2"),"equal counts use stable source order");
        e.s.studiedDays=null;e=new StudyEngine(words(),e.s);check(e.studyDays("w0")==3,"migration recovers distinct evidenced attempt days");check(e.studyDays("w4")==0,"migration excludes official-question links");check(e.studyDays("w2")==0,"missing old confidence-only days not guessed");
        e.confidence("w1",true,true);StudyEngine.save(e.s,new File("build/tests/repetition-state.bin"));
        System.out.println("Repetition behavior: "+checks+" assertions passed");
    }
}
