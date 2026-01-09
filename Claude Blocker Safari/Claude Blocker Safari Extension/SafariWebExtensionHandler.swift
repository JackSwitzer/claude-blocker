//
//  SafariWebExtensionHandler.swift
//  Claude Blocker Safari Extension
//
//  Created by Jack Switzer on 2026-01-08.
//

import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let message: [String: Any]?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey] as? [String: Any]
        } else {
            message = request?.userInfo?["message"] as? [String: Any]
        }

        guard let msg = message, let action = msg["action"] as? String else {
            sendResponse(context: context, data: ["error": "Invalid message"])
            return
        }

        switch action {
        case "getStatus":
            fetchBlockerStatus { result in
                self.sendResponse(context: context, data: result)
            }
        default:
            sendResponse(context: context, data: ["error": "Unknown action"])
        }
    }

    private func fetchBlockerStatus(completion: @escaping ([String: Any]) -> Void) {
        guard let url = URL(string: "http://localhost:8765/status") else {
            completion(["error": "Invalid URL"])
            return
        }

        let task = URLSession.shared.dataTask(with: url) { data, response, error in
            if let error = error {
                os_log(.error, "Blocker fetch error: %@", error.localizedDescription)
                completion(["error": error.localizedDescription])
                return
            }

            guard let data = data else {
                completion(["error": "No data"])
                return
            }

            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    completion(json)
                } else {
                    completion(["error": "Invalid JSON"])
                }
            } catch {
                os_log(.error, "JSON parse error: %@", error.localizedDescription)
                completion(["error": "JSON parse error"])
            }
        }
        task.resume()
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
