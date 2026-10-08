package net.gaiadesk.reactnative

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Autolinked by React Native (0.74+). */
class GaiaDeskEmbedPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == GaiaDeskEmbedModule.NAME) GaiaDeskEmbedModule(reactContext) else null

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
        mapOf(
            GaiaDeskEmbedModule.NAME to ReactModuleInfo(
                GaiaDeskEmbedModule.NAME,
                GaiaDeskEmbedModule.NAME,
                false, // canOverrideExistingModule
                false, // needsEagerInit
                false, // isCxxModule
                BuildConfig.IS_NEW_ARCHITECTURE_ENABLED, // isTurboModule
            ),
        )
    }
}
