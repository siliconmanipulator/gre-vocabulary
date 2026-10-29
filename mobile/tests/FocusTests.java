import com.greascent.app.StudyEngine;
import java.util.*;
import java.io.*;
public class FocusTests {
    static int checks;
    static void check(boolean condition,String message){checks++;if(!condition)throw new AssertionError(message);}
    static List<StudyEngine.Word> words(){List<StudyEngine.Word> list=new ArrayList<>();for(int i=0;i<46;i++)list.add(new StudyEngine.Word("w"+i,"term"+i,"source definition "+i,i));return list;}
    static StudyEngine fresh(){return new StudyEngine(words(),new StudyEngine.State());}
    public static void main(String[] args)throws Exception{
        if(args.length>0){StudyEngine e=new StudyEngine(words(),StudyEngine.load(new File(args[1])));
            check(e.s.meaningsVisible&&e.s.session.revealed,"meaning preference persisted or migrated from visible old card");
            if(args[0].equals("legacy")){check(e.s.learningMillis.isEmpty()&&e.s.practiceMillis.isEmpty(),"old time history starts empty, never guessed");e.jumpCard(3);check(e.s.session.revealed,"old visible state stays visible on navigation");check(e.s.theme.equals("light")&&e.s.attempts.size()==1,"old saved progress retained");}
            else{check(e.usage("learn",1)==1000,"learn duration survives new process");check(e.usage("practice",1)==2000&&e.usage("practice",2)==3000,"practice durations retain distinct study days");check(e.usage("learn",2)==0,"no cross-category fabricated time");}
            System.out.println("Focus persistence "+args[0]+": "+checks+" assertions passed");return;
        }
        StudyEngine e=fresh();e.startBlock(1,1);check(e.activity().equals("learn"),"flashcards classified as Learn");e.showMeanings(true);
        for(int i=0;i<15;i++){e.jumpCard(i);check(e.s.session.revealed,"slider preserves visible meaning at every position");}
        e.startBlock(1,2);check(e.s.session.revealed,"new block inherits reveal preference");e.startBlock(1,1);check(e.s.session.revealed,"resumed block inherits reveal preference");
        e.showMeanings(false);e.jumpCard(4);check(!e.s.session.revealed,"explicitly hidden preference stays hidden");e.startBlock(1,2);check(!e.s.session.revealed,"hidden preference shared across blocks");
        e.recordUsage(12000,true);check(e.usage("learn",1)==12000,"foreground Learn time recorded");e.recordUsage(999999,false);e.recordUsage(-100,true);check(e.usage("learn",1)==12000,"background and negative intervals ignored");
        for(String screen:Arrays.asList("today","library","settings","progress","review")){e.s.screen=screen;e.recordUsage(8000,true);check(e.usage("learn",1)==12000&&e.usage("practice",1)==0,"non-study navigation excluded: "+screen);}
        e.s.screen="learn";e.recordUsage(1000,true);e.beginQuiz();e.recordUsage(2000,true);check(e.usage("learn",1)==13000&&e.usage("practice",1)==2000,"boundary keeps pre-quiz interval in Learn");
        e.s.screen="practice";e.recordUsage(3000,true);check(e.usage("practice",1)==5000,"official practice classified as Practice");e.s.studyDay=2;e.recordUsage(4000,true);check(e.usage("practice",2)==4000&&e.usage("practice",1)==5000,"study days do not overwrite durations");
        e.s.screen="learn";e.s.session.index=e.s.session.queue.size();e.recordUsage(3000,true);check(e.usage("practice",2)==4000,"completed session excluded");
        e=fresh();e.confidence("w0",false,false);e.s.studyDay=2;e.startReview();e.recordUsage(5000,true);check(e.usage("practice",2)==5000,"scheduled review quiz classified as Practice");
        check(StudyEngine.fraction(1,0)==0&&StudyEngine.fraction(0,0)==0,"empty and review-only day rings safe");check(StudyEngine.fraction(-1,15)==0&&StudyEngine.fraction(99,15)==1,"ring values bounded");check(Math.abs(StudyEngine.fraction(21,45)-21f/45)<.0001,"daily ring actual completion fraction");check(Math.abs(StudyEngine.fraction(156,959)-156f/959)<.0001,"overall ring independent denominator");
        e=fresh();e.startBlock(1,1);e.showMeanings(true);e.recordUsage(1000,true);e.beginQuiz();e.recordUsage(2000,true);e.s.studyDay=2;e.recordUsage(3000,true);StudyEngine.save(e.s,new File("build/tests/focus-state.bin"));
        System.out.println("Focus behavior: "+checks+" assertions passed");
    }
}
