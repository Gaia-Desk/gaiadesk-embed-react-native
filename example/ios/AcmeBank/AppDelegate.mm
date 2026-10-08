#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <React/RCTLog.h>

@implementation AppDelegate {
  NSTimer *_commands;
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"AcmeBank";
  self.initialProps = @{};

  NSDictionary<NSString *, NSString *> *env = NSProcessInfo.processInfo.environment;
  if ([env[@"GAIADESK_DEMO_LOG"] isEqualToString:@"1"]) {
    // Tests: every console.log (the app's `GaiaDeskDemo {json}` lines) on
    // stdout, in Release builds too.
    RCTSetLogThreshold(RCTLogLevelInfo);
    RCTSetLogFunction(^(RCTLogLevel level, RCTLogSource source, NSString *file, NSNumber *line, NSString *message) {
      fprintf(stdout, "%s\n", message.UTF8String);
      fflush(stdout);
    });
  }
  if ([env[@"GAIADESK_DEMO_CMD"] isEqualToString:@"1"]) {
    [self watchCommands];
  }

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

// acmebank://… deep links reach JS (Linking).
- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options
{
  return [RCTLinkingManager application:application openURL:url options:options];
}

// Tests (GAIADESK_DEMO_CMD=1): an acmebank:// URL written to
// <app tmp>/gaiadesk-demo-cmd is delivered as a deep link (the Simulator asks
// before `simctl openurl` opens one).
- (void)watchCommands
{
  NSString *file = [NSTemporaryDirectory() stringByAppendingPathComponent:@"gaiadesk-demo-cmd"];
  [NSFileManager.defaultManager removeItemAtPath:file error:nil];
  _commands = [NSTimer scheduledTimerWithTimeInterval:0.2
                                              repeats:YES
                                                block:^(NSTimer *timer) {
                                                  NSString *cmd = [NSString stringWithContentsOfFile:file encoding:NSUTF8StringEncoding error:nil];
                                                  if (cmd.length == 0) {
                                                    return;
                                                  }
                                                  [NSFileManager.defaultManager removeItemAtPath:file error:nil];
                                                  NSURL *url = [NSURL URLWithString:[cmd stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet]];
                                                  if (url) {
                                                    [RCTLinkingManager application:UIApplication.sharedApplication openURL:url options:@{}];
                                                  }
                                                }];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
