package com.greascent.app;
import android.view.*;
import android.provider.Settings;
import java.util.*;
import java.util.function.Consumer;

/** Native spring engine clocked by the display's Choreographer; no fixed FPS or perpetual loop. */
public final class SpringMotion implements Choreographer.FrameCallback,View.OnAttachStateChangeListener {
    private static final Map<View,SpringMotion> active=new HashMap<>();
    private final View owner;private final SpringPhysics spring;private final Consumer<Float> frame;
    private long last;private boolean cancelled;private float scale=1;
    private SpringMotion(View owner,float from,float to,float stiffness,float damping,Consumer<Float> frame){this.owner=owner;this.frame=frame;spring=new SpringPhysics(from,to,stiffness,damping);}
    public static SpringMotion animate(View view,float from,float to,float stiffness,float damping,Consumer<Float> frame){
        SpringMotion old=active.get(view);if(old!=null)old.cancel();
        SpringMotion motion=new SpringMotion(view,from,to,stiffness,damping,frame);
        if(!android.animation.ValueAnimator.areAnimatorsEnabled()){frame.accept(to);motion.cancelled=true;return motion;}
        motion.scale=Settings.Global.getFloat(view.getContext().getContentResolver(),Settings.Global.ANIMATOR_DURATION_SCALE,1);
        if(motion.scale<=0){frame.accept(to);motion.cancelled=true;return motion;}
        active.put(view,motion);view.addOnAttachStateChangeListener(motion);frame.accept(from);Choreographer.getInstance().postFrameCallback(motion);return motion;
    }
    public static void enter(View view){animate(view,0,1,210,1,p->{view.setAlpha(Math.max(0,Math.min(1,p)));view.setTranslationY((1-p)*8*view.getResources().getDisplayMetrics().density);});}
    public static void press(View view,boolean pressed){SpringMotion old=active.get(view);float from=view.getScaleX();double velocity=old==null?0:old.spring.velocity;SpringMotion next=animate(view,from,pressed?.965f:1,500,.82f,p->{view.setScaleX(p);view.setScaleY(p);});next.spring.velocity=velocity;}
    public static void bindPress(View view){view.setOnTouchListener((v,e)->{int a=e.getActionMasked();if(a==MotionEvent.ACTION_DOWN)press(v,true);else if(a==MotionEvent.ACTION_UP||a==MotionEvent.ACTION_CANCEL)press(v,false);return false;});}
    @Override public void doFrame(long time){if(cancelled)return;if(last==0)last=time;double dt=(time-last)/1e9/scale;last=time;boolean more=spring.advance(dt);frame.accept((float)spring.value);if(more)Choreographer.getInstance().postFrameCallback(this);else cancel();}
    public void cancel(){if(cancelled)return;cancelled=true;Choreographer.getInstance().removeFrameCallback(this);owner.removeOnAttachStateChangeListener(this);if(active.get(owner)==this)active.remove(owner);}
    @Override public void onViewAttachedToWindow(View view){}
    @Override public void onViewDetachedFromWindow(View view){cancel();}
}
