//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Steph on 2024-09-22.
//

import SafariServices
import FoundationModels
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log(.default, "Received message from browser.runtime.sendNativeMessage: %@", String(describing: (message as? [String: Any])?["type"] ?? "unknown"))

        guard let messageDict = message as? [String: Any],
              let type = messageDict["type"] as? String else {
            sendResponse(context: context, data: ["error": "Invalid message format"])
            return
        }

        switch type {
        case "fetchRequest":
            handleFetchRequest(context: context, message: messageDict)
        case "appleIntelligencePrompt":
            if #available(iOS 26.0, macOS 26.0, *) {
                handleAppleIntelligencePrompt(context: context, message: messageDict)
            } else {
                sendResponse(context: context, data: [
                    "success": false, "error": "unavailable", "reason": "osVersionTooOld"
                ])
            }
        default:
            // Echo back for any other message type (original behavior)
            sendResponse(context: context, data: ["echo": message as Any])
        }
    }

    private func handleFetchRequest(context: NSExtensionContext, message: [String: Any]) {
        guard let urlString = message["url"] as? String,
              let url = URL(string: urlString) else {
            sendResponse(context: context, data: ["ok": false, "status": 0, "text": "", "error": "Invalid URL"])
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = (message["method"] as? String) ?? "GET"
        request.timeoutInterval = 15

        // Set headers — including Origin which browsers can't set
        if let headers = message["headers"] as? [String: String] {
            for (key, value) in headers {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }

        // Set body
        if let body = message["body"] as? String {
            request.httpBody = body.data(using: .utf8)
        }

        // Use a semaphore to make the async URLSession request synchronous.
        // Safari's sendNativeMessage expects beginRequest to complete
        // (call completeRequest) before returning to avoid response loss.
        let semaphore = DispatchSemaphore(value: 0)
        var responseData: [String: Any] = ["ok": false, "status": 0, "text": "", "error": "Timeout"]

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                responseData = ["ok": false, "status": 0, "text": "", "error": error.localizedDescription]
            } else {
                let httpResponse = response as? HTTPURLResponse
                let statusCode = httpResponse?.statusCode ?? 0
                let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                responseData = ["ok": statusCode >= 200 && statusCode < 300, "status": statusCode, "text": text]
            }
            semaphore.signal()
        }
        task.resume()
        semaphore.wait()

        sendResponse(context: context, data: responseData)
    }

    @available(iOS 26.0, macOS 26.0, *)
    private func handleAppleIntelligencePrompt(context: NSExtensionContext, message: [String: Any]) {
        guard let systemPrompt = message["systemPrompt"] as? String,
              let userMessage = message["userMessage"] as? String else {
            sendResponse(context: context, data: ["success": false, "error": "Invalid parameters"])
            return
        }

        let modelId = message["model"] as? String ?? "on-device"

        if modelId == "private-cloud" {
            if #available(iOS 27.0, macOS 27.0, *) {
                handleWithPCC(context: context, systemPrompt: systemPrompt, userMessage: userMessage)
            } else {
                sendResponse(context: context, data: [
                    "success": false, "error": "unavailable", "reason": "pccRequiresNewerOS"
                ])
            }
            return
        }

        if case .unavailable(let reason) = SystemLanguageModel.default.availability {
            let reasonString: String
            switch reason {
            case .deviceNotEligible:           reasonString = "deviceNotEligible"
            case .appleIntelligenceNotEnabled: reasonString = "appleIntelligenceNotEnabled"
            default:                           reasonString = "unknown"
            }
            sendResponse(context: context, data: [
                "success": false, "error": "unavailable", "reason": reasonString
            ])
            return
        }

        // Bridge async FoundationModels call to synchronous extension context,
        // matching the pattern used in handleFetchRequest.
        let semaphore = DispatchSemaphore(value: 0)
        var responseData: [String: Any] = ["success": false, "error": "Timeout"]

        Task {
            do {
                let session = LanguageModelSession(instructions: systemPrompt)
                let response = try await session.respond(to: userMessage)
                responseData = ["success": true, "content": response.content]
            } catch {
                // Map known FoundationModels error patterns to stable codes the JS side can handle.
                // TODO: LanguageModelError is only available in macOS 27 / iOS 27+.
                // Once minimum deployment target is raised, replace with typed case matching.
                let desc = error.localizedDescription.lowercased()
                let code: String
                if desc.contains("context") || desc.contains("too long") || desc.contains("token") {
                    code = "contextWindowExceeded"
                } else if desc.contains("guardrail") || desc.contains("policy") {
                    code = "guardrailsViolation"
                } else {
                    code = "languageModelError"
                }
                responseData = ["success": false, "error": code, "detail": error.localizedDescription]
            }
            semaphore.signal()
        }

        semaphore.wait()
        sendResponse(context: context, data: responseData)
    }

    @available(iOS 27.0, macOS 27.0, *)
    private func handleWithPCC(context: NSExtensionContext, systemPrompt: String, userMessage: String) {
        // TODO: PrivateCloudComputeLanguageModel is not available in the macOS 26 SDK.
        // Replace this stub with the full implementation once the macOS 27 SDK ships:
        //
        //   let model = PrivateCloudComputeLanguageModel()
        //   if model.quotaUsage.isLimitReached { ... }
        //   let session = LanguageModelSession(model: model, instructions: systemPrompt)
        //   let response = try await session.respond(to: userMessage)
        //   // include quotaWarning flag if model.quotaUsage.status isApproachingLimit
        //
        sendResponse(context: context, data: [
            "success": false, "error": "unavailable", "reason": "pccNotYetImplemented"
        ])
    }

    private func sendResponse(context: NSExtensionContext, data: [String: Any]) {
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: data]
        } else {
            response.userInfo = ["message": data]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
