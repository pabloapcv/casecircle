import Foundation

public enum Links {
    public static let processingTimes = URL(string: "https://egov.uscis.gov/processing-times/")!
    public static let supportEmail = "support@casecircle.app"
    public static var supportMail: URL { URL(string: "mailto:\(supportEmail)")! }
}
