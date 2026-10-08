// The Android native module `GaiaDeskEmbed`: the codegen spec under the new architecture, a
// ReactContextBaseJavaModule under the old one (GaiaDeskEmbedSpec picks). Every SDK call runs on
// the main thread, from the current activity; events go to JS as `GaiaDeskEmbedEvent`
// ({ tag, json }) through RCTDeviceEventEmitter.
package net.gaiadesk.reactnative

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import net.gaiadesk.embed.GaiaDeskEmbed
import net.gaiadesk.embed.GaiaDeskEmbedException

class GaiaDeskEmbedModule(context: ReactApplicationContext) : GaiaDeskEmbedSpec(context) {
    /** The running sessions by tag (main thread only), kept until `ended`. */
    private val sessions = HashMap<Int, GaiaDeskEmbed>()

    /** What JS last said about keyboard focus (setSecretFocus): for the running and the next sessions. */
    private var secretFocus: Boolean? = null

    override fun getName(): String = NAME

    /**
     * The user's consent travels inside [configJson] as `consent_token` (from requestConsent /
     * recordConsent); the library refuses to start without it, or with one for another session.
     */
    @ReactMethod
    override fun start(tag: Double, configJson: String, promise: Promise) {
        val t = tag.toInt()
        UiThreadUtil.runOnUiThread {
            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.reject("no_activity", "no activity in front: start from a screen the user is looking at")
                return@runOnUiThread
            }
            try {
                val config = EmbedBridgeJson.configuration(configJson, MaskUnits.of(activity))
                val token = EmbedBridgeJson.consentToken(configJson)
                if (token == null) {
                    promise.reject("consent_required", "consent_token is required: ask with requestConsent (or recordConsent after your own dialog)")
                    return@runOnUiThread
                }
                val consent = GaiaDeskEmbed.consent(token, config.company, config.guided, config.capture)
                val embed = GaiaDeskEmbed.start(activity, config, consent) { e -> deliver(t, e) }
                secretFocus?.let { embed.setSecretFocus(it) }
                sessions[t] = embed
                promise.resolve(null)
            } catch (e: GaiaDeskEmbedException) {
                promise.reject(e.code, e.message, e)
            } catch (e: UnsatisfiedLinkError) {
                promise.reject("not_linked", "libgaiadesk_embed is missing from this build: ${e.message}", e)
            } catch (e: Exception) {
                promise.reject("start_failed", e.message ?: e.toString(), e)
            }
        }
    }

    @ReactMethod
    override fun stop(tag: Double) {
        val t = tag.toInt()
        UiThreadUtil.runOnUiThread { sessions[t]?.stop() }
    }

    @ReactMethod
    override fun setMaskedRects(tag: Double, rects: ReadableArray, promise: Promise) {
        val t = tag.toInt()
        val flat = (0 until rects.size()).map { rects.getDouble(it) }
        UiThreadUtil.runOnUiThread {
            val embed = sessions[t]
            val activity = reactApplicationContext.currentActivity
            if (embed == null || activity == null) {
                promise.resolve(null) // ended (or no window to measure against): nothing to mask
                return@runOnUiThread
            }
            try {
                embed.setMaskedRects(EmbedBridgeJson.rects(flat, MaskUnits.of(activity)))
                promise.resolve(null)
            } catch (e: GaiaDeskEmbedException) {
                promise.reject(e.code, e.message, e)
            }
        }
    }

    /**
     * Keyboard focus entered (true) or left (false) a secret field: the whole RN UI is one Android
     * View, so the SDK cannot see which field has focus. While true, guided typing is refused.
     */
    @ReactMethod
    override fun setSecretFocus(secret: Boolean) {
        UiThreadUtil.runOnUiThread {
            secretFocus = secret
            sessions.values.forEach { it.setSecretFocus(secret) }
        }
    }

    @ReactMethod
    override fun setPaused(tag: Double, paused: Boolean) {
        val t = tag.toInt()
        UiThreadUtil.runOnUiThread { sessions[t]?.setPaused(paused) }
    }

    /** The library's dialog: resolves to the consent token, or "" when the user declined. */
    @ReactMethod
    override fun requestConsent(company: String, guided: Boolean, capture: String, promise: Promise) {
        val cap = capture(capture, promise) ?: return
        UiThreadUtil.runOnUiThread {
            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.reject("no_activity", "no activity in front to show the consent dialog on")
                return@runOnUiThread
            }
            try {
                GaiaDeskEmbed.requestConsent(activity, company, guided, cap) { consent -> promise.resolve(consent?.token ?: "") }
            } catch (e: GaiaDeskEmbedException) {
                promise.reject(e.code, e.message, e)
            }
        }
    }

    /** The app's own dialog said YES: the consent token for `start`. */
    @ReactMethod
    override fun recordConsent(company: String, guided: Boolean, capture: String, promise: Promise) {
        val cap = capture(capture, promise) ?: return
        try {
            promise.resolve(GaiaDeskEmbed.recordConsent(company, guided, cap).token)
        } catch (e: GaiaDeskEmbedException) {
            promise.reject(e.code, e.message, e)
        } catch (e: UnsatisfiedLinkError) {
            promise.reject("not_linked", "libgaiadesk_embed is missing from this build: ${e.message}", e)
        }
    }

    private fun capture(capture: String, promise: Promise): GaiaDeskEmbed.Capture? = when (capture) {
        "app" -> GaiaDeskEmbed.Capture.APP
        "screen" -> GaiaDeskEmbed.Capture.SCREEN
        else -> {
            promise.reject("bad_config", "capture \"$capture\" is not app or screen")
            null
        }
    }

    @ReactMethod
    override fun buildInfo(promise: Promise) {
        try {
            promise.resolve(GaiaDeskEmbed.buildInfo)
        } catch (e: UnsatisfiedLinkError) {
            promise.reject("not_linked", "libgaiadesk_embed is missing from this build: ${e.message}", e)
        }
    }

    // NativeEventEmitter's contract; the device event emitter needs nothing.
    @ReactMethod
    override fun addListener(eventName: String) {}

    @ReactMethod
    override fun removeListeners(count: Double) {}

    /** The JS side is going away (reload, teardown): nothing keeps sharing without it. */
    override fun invalidate() {
        UiThreadUtil.runOnUiThread {
            sessions.values.forEach { it.stop() }
            sessions.clear()
        }
        super.invalidate()
    }

    private fun deliver(tag: Int, e: GaiaDeskEmbed.Event) {
        if (e is GaiaDeskEmbed.Event.Ended) sessions.remove(tag)
        val ctx = reactApplicationContext
        if (!ctx.hasActiveReactInstance()) return
        val body = Arguments.createMap().apply {
            putInt("tag", tag)
            putString("json", EmbedBridgeJson.wire(e))
        }
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT_NAME, body)
    }

    companion object {
        const val NAME = "GaiaDeskEmbed"
        const val EVENT_NAME = "GaiaDeskEmbedEvent"
    }
}
