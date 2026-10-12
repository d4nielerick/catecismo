import AVFoundation
import MediaPlayer

/// Toca a voz de uma leitura, com controles na tela de bloqueio.
@MainActor
final class Player: ObservableObject {
    @Published private(set) var tocando: String?   // id da leitura em reprodução
    @Published private(set) var carregando: String?
    private var avplayer: AVPlayer?
    private var fim: NSObjectProtocol?

    init() {
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in self?.avplayer?.play(); return .success }
        c.pauseCommand.addTarget { [weak self] _ in self?.avplayer?.pause(); return .success }
    }

    func alternar(id: String, url: URL, titulo: String, subtitulo: String) {
        if tocando == id { parar(); return }
        parar()
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        avplayer = p
        tocando = id
        fim = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.parar() }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: titulo,
            MPMediaItemPropertyArtist: subtitulo,
            MPMediaItemPropertyAlbumTitle: "Liturgia Diária",
        ]
        p.play()
    }

    func parar() {
        avplayer?.pause()
        avplayer = nil
        tocando = nil
        if let fim { NotificationCenter.default.removeObserver(fim) }
        fim = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
}
