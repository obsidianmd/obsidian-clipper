# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.kts.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep kotlinx.serialization classes
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.obsidian.clipper.**$$serializer { *; }
-keepclassmembers class com.obsidian.clipper.** {
    *** Companion;
}
-keepclasseswithmembers class com.obsidian.clipper.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep JavaScript interfaces
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep data classes for serialization
-keep class com.obsidian.clipper.storage.** { *; }
