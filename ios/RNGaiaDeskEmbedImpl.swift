// The Swift half of the iOS module: calls the GaiaDeskEmbed pod on the main
// thread and hands events back to RNGaiaDeskEmbed.mm as the library's JSON,
// tagged with the session they belong to. Layout units are points on iOS,
// which is what the SDK's mask rects are in: no conversion.

import Foundation
import GaiaDeskEmbed
import UIKit

@objc(RNGaiaDeskEmbedImpl)
public final class RNGaiaDeskEmbedImpl: NSObject {
    /// (tag, event JSON) → JS. Called on the main thread.
    @objc public var emit: ((NSNumber, String) -> Void)?

    /// The running sessions by tag (main thread only). Kept until `ended`:
    /// the SDK object stops its session when released.
    private var sessions: [Int: GaiaDeskEmbed] = [:]
    /// Focus is in a secret field (JS's word; main thread only).
    private var secretFocus = false

    // MARK: - start / stop

    @objc public func start(_ tag: Int, configJson: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        DispatchQueue.main.async {
            let config: GaiaDeskEmbed.Configuration
            let consent: GaiaDeskEmbed.Consent
            do {
                config = try Self.configuration(configJson)
                // The token the SDK issued for the user's YES (JS carried it
                // in the config); the library checks it matches this session.
                guard let token = Self.consentToken(configJson) else {
                    throw GaiaDeskEmbedError(code: "consent_required", message: "the user's consent is required: requestConsent or recordConsent first")
                }
                consent = GaiaDeskEmbed.consent(token: token, company: config.company, guided: config.guided)
            } catch let e as GaiaDeskEmbedError {
                reject(e.code, e.message)
                return
            } catch {
                reject("bad_config", "\(error)")
                return
            }
            MainActor.assumeIsolated {
                do {
                    let embed = try GaiaDeskEmbed.start(config, consent: consent) { [weak self] event in
                        self?.deliver(tag, event)
                    }
                    embed.setSecretFocus(self.secretFocus)
                    self.sessions[tag] = embed
                    resolve(nil)
                } catch let e as GaiaDeskEmbedError {
                    reject(e.code, e.message)
                } catch {
                    reject("start_failed", "\(error)")
                }
            }
        }
    }

    @objc public func stop(_ tag: Int) {
        DispatchQueue.main.async { self.sessions[tag]?.stop() }
    }

    /// The JS side is going away (reload, teardown): nothing keeps sharing without it.
    @objc public func stopAll() {
        DispatchQueue.main.async {
            self.sessions.values.forEach { $0.stop() }
            self.sessions.removeAll()
        }
    }

    @objc public func setMaskedRects(_ tag: Int, rects: [NSNumber], resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        DispatchQueue.main.async {
            guard rects.count % 4 == 0 else {
                reject("bad_rects", "rects must be [x, y, w, h, …]")
                return
            }
            guard let embed = self.sessions[tag] else {
                resolve(nil) // ended: nothing to mask
                return
            }
            let v = rects.map { CGFloat($0.doubleValue) }
            let cg = stride(from: 0, to: v.count, by: 4).map { CGRect(x: v[$0], y: v[$0 + 1], width: v[$0 + 2], height: v[$0 + 3]) }
            do {
                try embed.setMaskedRects(cg)
                resolve(nil)
            } catch let e as GaiaDeskEmbedError {
                reject(e.code, e.message)
            } catch {
                reject("bad_rects", "\(error)")
            }
        }
    }

    /// Focus entered or left a secret field: every session (and the next) refuses guided typing meanwhile.
    @objc public func setSecretFocus(_ secret: Bool) {
        DispatchQueue.main.async {
            self.secretFocus = secret
            self.sessions.values.forEach { $0.setSecretFocus(secret) }
        }
    }

    @objc public func setPaused(_ tag: Int, paused: Bool) {
        DispatchQueue.main.async { self.sessions[tag]?.setPaused(paused) }
    }

    // MARK: - consent, build info

    /// The SDK's dialog: on YES the library's consent token, "" when declined.
    @objc public func requestConsent(_ company: String, guided: Bool, capture: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        guard capture == "app" else {
            reject("bad_config", "capture \"\(capture)\" is not available on iOS: the embed shares this app only")
            return
        }
        Task { @MainActor in
            let consent = await GaiaDeskEmbed.requestConsent(company: company, guided: guided)
            resolve(consent?.token ?? "")
        }
    }

    /// The app's own dialog said YES: the library's consent token.
    @objc public func recordConsent(_ company: String, guided: Bool, capture: String, resolve: @escaping (Any?) -> Void, reject: @escaping (String, String) -> Void) {
        guard capture == "app" else {
            reject("bad_config", "capture \"\(capture)\" is not available on iOS: the embed shares this app only")
            return
        }
        do {
            resolve(try GaiaDeskEmbed.recordConsent(company: company, guided: guided).token)
        } catch let e as GaiaDeskEmbedError {
            reject(e.code, e.message)
        } catch {
            reject("consent_required", "\(error)")
        }
    }

    static func consentToken(_ json: String) -> String? {
        guard let d = json.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let t = o["consent_token"] as? String, !t.isEmpty else { return nil }
        return t
    }

    @objc public func buildInfo() -> String {
        GaiaDeskEmbed.buildInfo
    }

    // MARK: - plumbing

    private func deliver(_ tag: Int, _ event: GaiaDeskEmbed.Event) {
        if case .ended = event { sessions[tag] = nil }
        emit?(NSNumber(value: tag), Self.wire(event))
    }

    /// The JS layer's config JSON → the SDK's Configuration.
    static func configuration(_ json: String) throws -> GaiaDeskEmbed.Configuration {
        guard let d = json.data(using: .utf8), let o = try JSONSerialization.jsonObject(with: d) as? [String: Any] else {
            throw GaiaDeskEmbedError(code: "bad_config", message: "the config is not a JSON object")
        }
        if let capture = o["capture"] as? String, capture != "app" {
            throw GaiaDeskEmbedError(code: "bad_config", message: "capture \"\(capture)\" is not available on iOS: the embed shares this app only")
        }
        var server: URL?
        if let s = o["server"] as? String {
            guard let u = URL(string: s) else { throw GaiaDeskEmbedError(code: "bad_server", message: "not a URL: \(s)") }
            server = u
        }
        let method: GaiaDeskEmbed.CaptureMethod
        switch o["capture_method"] as? String ?? "replayKit" {
        case "replayKit": method = .replayKit
        case "snapshot": method = .snapshot
        case let other: throw GaiaDeskEmbedError(code: "bad_config", message: "captureMethod \"\(other)\" is not replayKit or snapshot")
        }
        let masks = (o["masks"] as? [[String: Any]] ?? []).map { m -> CGRect in
            let n = { (k: String) in CGFloat((m[k] as? NSNumber)?.doubleValue ?? .nan) }
            return CGRect(x: n("x"), y: n("y"), width: n("w"), height: n("h"))
        }
        return GaiaDeskEmbed.Configuration(
            embedToken: o["embed_token"] as? String ?? "",
            company: o["company"] as? String ?? "",
            server: server,
            guided: o["guided"] as? Bool ?? false,
            fps: (o["fps"] as? NSNumber)?.intValue ?? 15,
            maskedRects: masks,
            captureMethod: method
        )
    }

    /// An SDK event → the library's JSON (what the JS layer parses).
    static func wire(_ e: GaiaDeskEmbed.Event) -> String {
        let null = NSNull()
        let o: [String: Any]
        switch e {
        case .state(let s): o = ["type": "state", "state": s]
        case .code(let code, let sessionId, let mode): o = ["type": "code", "code": code, "session_id": sessionId, "mode": mode]
        case .joined(let agent): o = ["type": "joined", "agent": agent ?? null]
        case .left: o = ["type": "left"]
        case .control(let allowed): o = ["type": "control", "allowed": allowed]
        case .action(let action, let applied, let reason): o = ["type": "action", "action": action, "applied": applied, "reason": reason ?? null]
        case .error(let code, let message): o = ["type": "error", "code": code, "message": message]
        case .ended(let reason): o = ["type": "ended", "reason": reason]
        }
        guard let d = try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys]) else { return "{}" }
        return String(decoding: d, as: UTF8.self)
    }
}
