# The iOS half of @gaiadesk/embed-react-native: the `GaiaDeskEmbed` native
# module (ObjC++ for React Native, Swift over the GaiaDeskEmbed pod).
# `pod install` in your app's ios/ pulls GaiaDeskEmbed (the Swift SDK and its
# prebuilt GaiaDeskEmbedFFI.xcframework) with it.
require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "GaiaDeskEmbedReactNative"
  s.version = package["version"]
  s.summary = "React Native wrapper over GaiaDeskEmbed: a \"Get help\" button that shares the app's own screen with your support team."
  s.homepage = package["homepage"]
  s.license = { :type => "MIT", :file => "LICENSE" }
  s.author = { "GaiaDesk" => "noreply@gaiadesk.net" }
  s.platforms = { :ios => "15.1" }
  s.source = { :git => "https://github.com/Gaia-Desk/gaiadesk-embed-react-native.git", :tag => "v#{s.version}" }
  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.swift_version = "5.9"

  s.dependency "GaiaDeskEmbed", "~> 0.1"

  # The Swift half is imported by the ObjC++ module through its generated header.
  s.pod_target_xcconfig = { "DEFINES_MODULE" => "YES" }

  if respond_to?(:install_modules_dependencies, true)
    # React Native 0.71+: React-Core, codegen and (new architecture) the TurboModule deps.
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
  end
end
