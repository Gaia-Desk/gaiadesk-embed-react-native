// The iOS native module `GaiaDeskEmbed`: a TurboModule under the new
// architecture (codegen's NativeGaiaDeskEmbedSpec), a classic bridge module
// under the old one. Events go out as `GaiaDeskEmbedEvent` ({ tag, json })
// through RCTEventEmitter, which both architectures support. The work is in
// RNGaiaDeskEmbedImpl.swift (the GaiaDeskEmbed pod is Swift).

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import <RNGaiaDeskEmbedSpec/RNGaiaDeskEmbedSpec.h>
#endif

#if __has_include(<GaiaDeskEmbedReactNative/GaiaDeskEmbedReactNative-Swift.h>)
#import <GaiaDeskEmbedReactNative/GaiaDeskEmbedReactNative-Swift.h>
#else
#import "GaiaDeskEmbedReactNative-Swift.h"
#endif

static NSString *const kEventName = @"GaiaDeskEmbedEvent";

#ifdef RCT_NEW_ARCH_ENABLED
@interface RNGaiaDeskEmbed : RCTEventEmitter <NativeGaiaDeskEmbedSpec>
#else
@interface RNGaiaDeskEmbed : RCTEventEmitter <RCTBridgeModule>
#endif
@end

@implementation RNGaiaDeskEmbed {
  RNGaiaDeskEmbedImpl *_impl;
  BOOL _observing;
}

RCT_EXPORT_MODULE(GaiaDeskEmbed)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if (self = [super init]) {
    _impl = [RNGaiaDeskEmbedImpl new];
    __weak RNGaiaDeskEmbed *weakSelf = self;
    _impl.emit = ^(NSNumber *tag, NSString *json) {
      [weakSelf emitTag:tag json:json];
    };
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kEventName ];
}

- (void)startObserving
{
  _observing = YES;
}

- (void)stopObserving
{
  _observing = NO;
}

- (void)emitTag:(NSNumber *)tag json:(NSString *)json
{
  // The JS layer subscribes before its first start, so nothing is lost here.
  if (_observing) {
    [self sendEventWithName:kEventName body:@{@"tag" : tag, @"json" : json}];
  }
}

// The JS side is going away (reload, teardown): nothing keeps sharing without it.
- (void)invalidate
{
  [_impl stopAll];
  _observing = NO;
  [super invalidate];
}

static void (^rejecter(RCTPromiseRejectBlock reject))(NSString *, NSString *)
{
  return ^(NSString *code, NSString *message) {
    reject(code, message, nil);
  };
}

RCT_EXPORT_METHOD(start : (double)tag configJson : (NSString *)configJson resolve : (RCTPromiseResolveBlock)
                      resolve reject : (RCTPromiseRejectBlock)reject)
{
  [_impl start:(NSInteger)tag configJson:configJson resolve:resolve reject:rejecter(reject)];
}

RCT_EXPORT_METHOD(stop : (double)tag)
{
  [_impl stop:(NSInteger)tag];
}

RCT_EXPORT_METHOD(setMaskedRects : (double)tag rects : (NSArray *)rects resolve : (RCTPromiseResolveBlock)
                      resolve reject : (RCTPromiseRejectBlock)reject)
{
  NSMutableArray<NSNumber *> *numbers = [NSMutableArray arrayWithCapacity:rects.count];
  for (id v in rects) {
    if (![v isKindOfClass:[NSNumber class]]) {
      reject(@"bad_rects", @"rects must be numbers", nil);
      return;
    }
    [numbers addObject:v];
  }
  [_impl setMaskedRects:(NSInteger)tag rects:numbers resolve:resolve reject:rejecter(reject)];
}

RCT_EXPORT_METHOD(setSecretFocus : (BOOL)secret)
{
  [_impl setSecretFocus:secret];
}

RCT_EXPORT_METHOD(setPaused : (double)tag paused : (BOOL)paused)
{
  [_impl setPaused:(NSInteger)tag paused:paused];
}

RCT_EXPORT_METHOD(requestConsent : (NSString *)company guided : (BOOL)guided capture : (NSString *)capture resolve : (
    RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [_impl requestConsent:company guided:guided capture:capture resolve:resolve reject:rejecter(reject)];
}

RCT_EXPORT_METHOD(recordConsent : (NSString *)company guided : (BOOL)guided capture : (NSString *)capture resolve : (
    RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  [_impl recordConsent:company guided:guided capture:capture resolve:resolve reject:rejecter(reject)];
}

RCT_EXPORT_METHOD(buildInfo : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
{
  resolve([_impl buildInfo]);
}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeGaiaDeskEmbedSpecJSI>(params);
}
#endif

@end
