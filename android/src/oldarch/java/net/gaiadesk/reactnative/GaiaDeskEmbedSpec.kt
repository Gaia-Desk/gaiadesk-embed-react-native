package net.gaiadesk.reactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReadableArray

/**
 * Old architecture: the same methods as the codegen spec, on a classic bridge module (the
 * implementation marks them @ReactMethod).
 */
abstract class GaiaDeskEmbedSpec(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    abstract fun start(tag: Double, configJson: String, consentGranted: Boolean, promise: Promise)
    abstract fun stop(tag: Double)
    abstract fun setMaskedRects(tag: Double, rects: ReadableArray, promise: Promise)
    abstract fun setPaused(tag: Double, paused: Boolean)
    abstract fun requestConsent(company: String, guided: Boolean, capture: String, promise: Promise)
    abstract fun buildInfo(promise: Promise)
    abstract fun addListener(eventName: String)
    abstract fun removeListeners(count: Double)
}
