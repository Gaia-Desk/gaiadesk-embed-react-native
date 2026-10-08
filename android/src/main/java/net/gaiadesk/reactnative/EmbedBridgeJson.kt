package net.gaiadesk.reactnative

import android.app.Activity
import android.graphics.Rect
import android.graphics.RectF
import net.gaiadesk.embed.GaiaDeskEmbed
import net.gaiadesk.embed.GaiaDeskEmbedException
import org.json.JSONObject
import kotlin.math.ceil
import kotlin.math.floor

/**
 * React Native layout units → the SDK's window pixels.
 *
 * Mask rects come from `measureInWindow`, which on Android is in dp and relative to the window's
 * VISIBLE display frame (React Native subtracts `getWindowVisibleDisplayFrame`'s top-left, i.e.
 * the status bar in a normal activity), on both architectures. The SDK wants pixels relative to
 * the window itself (`getLocationInWindow`). So: times the display density, plus the visible
 * frame's offset inside the window. Rounded outward, so a mask never shrinks.
 */
class MaskUnits(private val density: Float, private val offsetX: Float, private val offsetY: Float) {
    fun toWindowPixels(x: Double, y: Double, w: Double, h: Double): RectF {
        val left = floor(x * density + offsetX).toFloat()
        val top = floor(y * density + offsetY).toFloat()
        val right = ceil((x + w) * density + offsetX).toFloat()
        val bottom = ceil((y + h) * density + offsetY).toFloat()
        return RectF(left, top, right, bottom)
    }

    companion object {
        /** The units of [activity]'s window, now. Call on the main thread. */
        fun of(activity: Activity): MaskUnits {
            val decor = activity.window.decorView
            val visible = Rect()
            decor.getWindowVisibleDisplayFrame(visible)
            val windowOnScreen = IntArray(2)
            decor.getLocationOnScreen(windowOnScreen)
            return MaskUnits(
                activity.resources.displayMetrics.density,
                (visible.left - windowOnScreen[0]).toFloat(),
                (visible.top - windowOnScreen[1]).toFloat(),
            )
        }
    }
}

/** The JS layer's JSON in, the SDK's events out. */
object EmbedBridgeJson {
    private fun refuse(code: String, message: String): Nothing = throw GaiaDeskEmbedException(code, message)

    /** The config JSON (see src/config.ts) → the SDK's Configuration. */
    fun configuration(json: String, units: MaskUnits): GaiaDeskEmbed.Configuration {
        val o = try {
            JSONObject(json)
        } catch (e: Exception) {
            refuse("bad_config", "the config is not a JSON object")
        }
        if (o.has("capture_method")) refuse("bad_config", "captureMethod is iOS only")
        val capture = when (val c = o.optString("capture", "app")) {
            "app" -> GaiaDeskEmbed.Capture.APP
            "screen" -> GaiaDeskEmbed.Capture.SCREEN
            else -> refuse("bad_config", "capture \"$c\" is not app or screen")
        }
        val masks = mutableListOf<RectF>()
        o.optJSONArray("masks")?.let { arr ->
            for (i in 0 until arr.length()) {
                val m = arr.getJSONObject(i)
                masks += units.toWindowPixels(m.getDouble("x"), m.getDouble("y"), m.getDouble("w"), m.getDouble("h"))
            }
        }
        return GaiaDeskEmbed.Configuration(
            embedToken = o.optString("embed_token", ""),
            company = o.optString("company", ""),
            server = if (o.has("server") && !o.isNull("server")) o.getString("server") else null,
            guided = o.optBoolean("guided", false),
            fps = o.optInt("fps", 15),
            maskedRects = masks,
            capture = capture,
        )
    }

    /** A flat `[x, y, w, h, …]` in layout units → window pixels. */
    fun rects(flat: List<Double>, units: MaskUnits): List<RectF> {
        if (flat.size % 4 != 0) refuse("bad_rects", "rects must be [x, y, w, h, …]")
        return flat.chunked(4).map { (x, y, w, h) ->
            if (listOf(x, y, w, h).any { !it.isFinite() } || w < 0 || h < 0) refuse("bad_rects", "a rect is not finite or has a negative size")
            units.toWindowPixels(x, y, w, h)
        }
    }

    /** An SDK event → the library's JSON (what the JS layer parses). */
    fun wire(e: GaiaDeskEmbed.Event): String {
        val o = JSONObject()
        when (e) {
            is GaiaDeskEmbed.Event.State -> o.put("type", "state").put("state", e.state)
            is GaiaDeskEmbed.Event.Code -> o.put("type", "code").put("code", e.code).put("session_id", e.sessionId).put("mode", e.mode)
            is GaiaDeskEmbed.Event.Joined -> o.put("type", "joined").put("agent", e.agent ?: JSONObject.NULL)
            is GaiaDeskEmbed.Event.Left -> o.put("type", "left")
            is GaiaDeskEmbed.Event.Control -> o.put("type", "control").put("allowed", e.allowed)
            is GaiaDeskEmbed.Event.Action ->
                o.put("type", "action").put("action", e.action).put("applied", e.applied).put("reason", e.reason ?: JSONObject.NULL)
            is GaiaDeskEmbed.Event.Error -> o.put("type", "error").put("code", e.code).put("message", e.message)
            is GaiaDeskEmbed.Event.Ended -> o.put("type", "ended").put("reason", e.reason)
        }
        return o.toString()
    }
}
