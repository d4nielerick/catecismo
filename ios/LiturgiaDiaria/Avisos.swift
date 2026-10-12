import Foundation
import UserNotifications

/// Aviso local das 6h com a referência do Evangelho. Agendado no próprio aparelho:
/// não depende de servidor nem de internet na hora (as próximas duas semanas são agendadas
/// toda vez que o app abre).
enum Avisos {
    static let chaveLigado = "avisos6h"
    static let dias = 14

    static func ligados() -> Bool { UserDefaults.standard.bool(forKey: chaveLigado) }

    static func ligar() async -> Bool {
        let ok = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
        UserDefaults.standard.set(ok, forKey: chaveLigado)
        if ok { await reagendar() }
        return ok
    }

    static func desligar() {
        UserDefaults.standard.set(false, forKey: chaveLigado)
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }

    static func reagendar() async {
        guard ligados() else { return }
        let centro = UNUserNotificationCenter.current()
        centro.removeAllPendingNotificationRequests()
        let hoje = Calendar.current.startOfDay(for: Date())
        for i in 0..<dias {
            guard let dia = Calendar.current.date(byAdding: .day, value: i, to: hoje),
                  let d = try? await Servidor.compartilhado.dia(Datas.chave(dia)) else { continue }
            var quando = Calendar.current.dateComponents([.year, .month, .day], from: dia)
            quando.hour = 6; quando.minute = 0
            if let h = Calendar.current.date(from: quando), h <= Date() { continue }   // 6h de hoje já passou
            let ev = d.leituras.first(where: { $0.tipo == "evangelho" })
            let c = UNMutableNotificationContent()
            c.title = "Evangelho de hoje"
            c.body = [ev?.referencia, d.celebracao].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            c.sound = .default
            try? await centro.add(UNNotificationRequest(identifier: "ev-\(d.data)", content: c,
                                  trigger: UNCalendarNotificationTrigger(dateMatching: quando, repeats: false)))
        }
    }
}
