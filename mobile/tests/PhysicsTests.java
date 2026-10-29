import com.greascent.app.SpringPhysics;
public class PhysicsTests {
    static int n;static void check(boolean b,String s){n++;if(!b)throw new AssertionError(s);}
    public static void main(String[] args){
        for(double damping:new double[]{.45,.82,1,1.5,4}){
            SpringPhysics a=new SpringPhysics(0,1,210,damping),b=new SpringPhysics(0,1,210,damping);
            for(int i=0;i<60;i++)a.advance(1./60);for(int i=0;i<120;i++)b.advance(1./120);
            check(Math.abs(a.value-b.value)<.001,"60/120Hz equal state");check(Math.abs(a.velocity-b.velocity)<.01,"equal velocity");
            a.advance(100);check(a.value==1&&a.velocity==0,"long frame settles safely");a.retarget(-1);check(a.value==1,"retarget has no position jump");a.advance(.05);double v=a.velocity,x=a.value;a.retarget(.2);check(a.velocity==v&&a.value==x,"retarget retains velocity");
            for(int i=0;i<600;i++){a.advance(1./120);check(Double.isFinite(a.value)&&Double.isFinite(a.velocity),"bounded finite spring state");}check(Math.abs(a.value-.2)<.001,"converges after retarget");
        }
        for(double invalid:new double[]{-1,Double.NaN,Double.POSITIVE_INFINITY}){try{new SpringPhysics(0,1,invalid,1);throw new AssertionError("invalid parameter accepted");}catch(IllegalArgumentException good){check(true,"reject invalid spring");}}
        SpringPhysics p=new SpringPhysics(0,1,200,1);try{p.advance(-.1);throw new AssertionError();}catch(IllegalArgumentException good){check(true,"negative time rejected");}p.advance(0);check(p.value==0,"zero time unchanged");
        System.out.println("Spring physics: "+n+" assertions passed");
    }
}
