package com.greascent.app;

/** Analytic mass/spring/damper solver. Frame-rate independent, with continuous velocity on retarget. */
public final class SpringPhysics {
    public double value,velocity,target;
    private final double omega,zeta;
    public SpringPhysics(double value,double target,double stiffness,double dampingRatio){
        if(!Double.isFinite(value)||!Double.isFinite(target)||!Double.isFinite(stiffness)||!Double.isFinite(dampingRatio)||stiffness<=0||dampingRatio<=0)throw new IllegalArgumentException("Finite positive spring parameters required");
        this.value=value;this.target=target;omega=Math.sqrt(stiffness);zeta=dampingRatio;
    }
    public void retarget(double target){if(!Double.isFinite(target))throw new IllegalArgumentException("Finite target required");this.target=target;}
    public boolean advance(double dt){
        if(!Double.isFinite(dt)||dt<0)throw new IllegalArgumentException("Finite nonnegative elapsed time required");
        double x=value-target,v=velocity,w=omega;
        if(zeta<.999999){double wd=w*Math.sqrt(1-zeta*zeta),e=Math.exp(-zeta*w*dt),c=Math.cos(wd*dt),s=Math.sin(wd*dt),b=(v+zeta*w*x)/wd;
            value=target+e*(x*c+b*s);velocity=e*(-zeta*w*(x*c+b*s)+wd*(-x*s+b*c));
        }else if(zeta<=1.000001){double b=v+w*x,e=Math.exp(-w*dt);value=target+e*(x+b*dt);velocity=e*(b-w*(x+b*dt));
        }else{double q=Math.sqrt(zeta*zeta-1),r1=-w/(zeta+q),r2=-w*(zeta+q),a=(v-r2*x)/(r1-r2),b=x-a,e1=Math.exp(r1*dt),e2=Math.exp(r2*dt);value=target+a*e1+b*e2;velocity=a*r1*e1+b*r2*e2;}
        boolean rest=Math.abs(value-target)<.0005&&Math.abs(velocity)<.005;if(rest){value=target;velocity=0;}return !rest;
    }
}
