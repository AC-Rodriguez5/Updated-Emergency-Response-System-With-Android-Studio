allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// camera_android_camerax compiles against camera-core, whose type annotations reference
// androidx.concurrent.futures.CallbackToFutureAdapter. camera-core exposes that artifact as
// `implementation`, so it is absent from the plugin module's compile classpath. JDK 25's javac
// rejects that outright (JDK 21 tolerated it), so put it back on the compile classpath only.
// The app modules already declare the same artifact for the same reason.
subprojects {
    if (name == "camera_android_camerax") {
        plugins.withId("com.android.library") {
            dependencies.add("compileOnly", "androidx.concurrent:concurrent-futures:1.2.0")
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
