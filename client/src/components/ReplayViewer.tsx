/** Radar Room replay layer: a forensic map surface driven only by exported Sentinel replay frames. */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Eye, EyeOff, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

type ReplayPlayer = { steam_id: number; name: string; team: string; x: number; y: number; z: number; health: number; alive: boolean; yaw: number };
type ReplayFrame = { tick: number; round: number; players: ReplayPlayer[]; visible_pairs: { observer: number; target: number }[] };
type ReplayData = { version: string; map: string; tick_rate: number; frames: ReplayFrame[] };

export default function ReplayViewer({ apiUrl, reportId, onClose }: { apiUrl: string; reportId: string | null; onClose: () => void }) {
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visibility, setVisibility] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "missing">("idle");

  useEffect(() => {
    if (!reportId) { setReplay(null); setStatus("idle"); return; }
    let cancelled = false;
    setStatus("loading");
    setFrameIndex(0);
    fetch(`${apiUrl}/v1/replays/${reportId}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("replay missing")))
      .then((data: ReplayData) => { if (!cancelled) { setReplay(data); setStatus("idle"); } })
      .catch(() => !cancelled && setStatus("missing"));
    return () => { cancelled = true; };
  }, [apiUrl, reportId]);

  useEffect(() => {
    if (!isPlaying || !replay) return;
    const timer = window.setInterval(() => setFrameIndex((index) => index >= replay.frames.length - 1 ? 0 : index + 1), 180);
    return () => window.clearInterval(timer);
  }, [isPlaying, replay]);

  const frame = replay?.frames[frameIndex];
  const bounds = useMemo(() => {
    const players = replay?.frames.flatMap((item) => item.players) ?? [];
    const xs = players.map((player) => player.x); const ys = players.map((player) => player.y);
    return { minX: Math.min(...xs, 0), maxX: Math.max(...xs, 1), minY: Math.min(...ys, 0), maxY: Math.max(...ys, 1) };
  }, [replay]);
  const point = (player: ReplayPlayer) => ({ x: 8 + ((player.x - bounds.minX) / Math.max(bounds.maxX - bounds.minX, 1)) * 84, y: 90 - ((player.y - bounds.minY) / Math.max(bounds.maxY - bounds.minY, 1)) * 80 });
  const playerById = useMemo(() => new Map(frame?.players.map((player) => [player.steam_id, player])), [frame]);

  return <section className="replay-viewer" aria-label="Interactive Replay Viewer">
    <header className="replay-header"><div><button type="button" className="back-action" onClick={onClose}><ChevronLeft size={16} /> К обзору</button><p className="eyebrow amber">ИНТЕРАКТИВНЫЙ ПОВТОР</p><h2>{replay ? replay.map.replace("de_", "").toUpperCase() : "Кадры повтора"}</h2></div><div className="replay-meta"><span>RPT / {reportId ?? "—"}</span><span>VIS / {visibility ? "ON" : "OFF"}</span></div></header>
    {frame && replay ? <>
      <div className="replay-map" style={{ backgroundImage: "linear-gradient(rgba(8,22,21,.74), rgba(8,22,21,.89)), url('/manus-storage/sentinel-route-map_6c357b2d.jpg')" }}>
        <div className="map-stamp">ROUND / {String(frame.round).padStart(2, "0")}<br />TICK / {frame.tick}<br />RATE / {replay.tick_rate}</div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`visibility-layer ${visibility ? "shown" : ""}`}>{visibility && frame.visible_pairs.map((pair) => { const observer = playerById.get(pair.observer); const target = playerById.get(pair.target); if (!observer || !target) return null; const from = point(observer); const to = point(target); return <line key={`${pair.observer}-${pair.target}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />; })}</svg>
        {frame.players.map((player) => { const position = point(player); return <div className={`replay-player ${player.team === "Terrorist" ? "t-side" : "ct-side"} ${!player.alive ? "eliminated" : ""}`} key={player.steam_id} style={{ left: `${position.x}%`, top: `${position.y}%` }}><i style={{ transform: `rotate(${player.yaw}deg)` }} /><span>{player.name}</span><small>{player.health}</small></div>; })}
        <div className="map-legend"><span className="legend-ct" /> CT <span className="legend-t" /> T <span className="legend-los" /> LOS</div>
      </div>
      <div className="replay-controls"><button type="button" aria-label="К первому кадру" onClick={() => setFrameIndex(0)}><SkipBack size={17} /></button><button type="button" aria-label="Предыдущий кадр" onClick={() => setFrameIndex((index) => Math.max(0, index - 1))}><ChevronLeft size={17} /></button><button type="button" className="play-control" aria-label={isPlaying ? "Пауза" : "Воспроизвести"} onClick={() => setIsPlaying((value) => !value)}>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button><button type="button" aria-label="Следующий кадр" onClick={() => setFrameIndex((index) => Math.min(replay.frames.length - 1, index + 1))}><SkipForward size={17} /></button><button type="button" aria-label="Сбросить повтор" onClick={() => { setFrameIndex(0); setIsPlaying(false); }}><RotateCcw size={16} /></button><input aria-label="Позиция повтора" type="range" min="0" max={Math.max(replay.frames.length - 1, 0)} value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))} /><output>{frameIndex + 1} / {replay.frames.length}</output><button type="button" className={`visibility-toggle ${visibility ? "on" : ""}`} onClick={() => setVisibility((value) => !value)}>{visibility ? <Eye size={16} /> : <EyeOff size={16} />} Visibility</button></div>
      <div className="replay-inspector"><div><span>КАДР</span><strong>{frame.players.filter((player) => player.alive).length} игроков в живом состоянии</strong></div><div><span>ЛИНИИ ВИДИМОСТИ</span><strong>{frame.visible_pairs.length} подтверждённых пар</strong></div><div><span>ИСТОЧНИК</span><strong>Visibility Engine · карта + FOV + дым</strong></div></div>
    </> : <div className="replay-empty"><EyeOff size={24} /><div><strong>{status === "loading" ? "Загружаем кадры повтора" : status === "missing" ? "Экспорт повторов не найден" : "Выберите отчёт из архива"}</strong><p>{status === "missing" ? "Создайте sidecar-файл командой `sentinel replay match.dem reports/report_id.replay.json`, затем обновите панель." : "Viewer показывает только кадры, экспортированные из реальной демо-записи."}</p></div></div>}
  </section>;
}
