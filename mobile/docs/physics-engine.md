# V1 spring physics engine

Native SpringPhysics solves the damped mass/spring differential equation analytically for under-, critical- and overdamping. SpringMotion clocks it with Choreographer rather than a fixed FPS, carries velocity during press retargeting, respects global animator enable/duration settings and cancels on detach/rest. No network, native ABI library or third-party content dependency is introduced.

Screen/card entry, button/navigation press, carousel, startup/mountain/streak and completion/time rings use this engine. Android ScrollView retains platform fling physics. Typography, content, progress and timer values do not change.

PhysicsTests: 3,035 assertions for 60/120Hz equivalent state/velocity, damping modes, settling, 100-second stalls, velocity-preserving retargeting and invalid inputs. Entire suite: 15 Python tests and 13,276 Java assertions. APK resources/Java/DEX/signatures/alignment/content checks pass. No native frame-time benchmark, Samsung-device run or emulator run is claimed; actual jank/smoothness still needs runtime verification.
