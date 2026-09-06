export class GamePlaybackAdapter {
  constructor({ id = 'generic.playback', version = '1.0.0' } = {}) { this.id = id; this.version = version; }

  toUserSong({ job, mediaUrl = '' } = {}) {
    return {
      userSongId: job.jobId, id: job.jobId, name: job.filename, filename: job.filename,
      audioUrl: mediaUrl, videoUrl: mediaUrl, videoByTodView: [], nameKey: job.jobId,
      performanceType: 'Solo', duration: job.info?.duration ?? 0, source: 'linli-nocturne',
    };
  }
}

export class OliviaLinPlaybackAdapter extends GamePlaybackAdapter {
  constructor(options = {}) { super({ id: 'olivia-lin.native', version: '0.0.9.627', ...options }); }

  toUserSong({ job, mediaUrl = '' } = {}) {
    const duration = Math.max(0, Math.round(Number(job.info?.duration ?? 0)));
    const videoByTodView = mediaUrl ? [
      { url: mediaUrl, tod: 'TOD1200', view: 'NI', coverUrl: '', duration },
      { url: mediaUrl, tod: 'TOD1730', view: 'NI', coverUrl: '', duration },
      { url: mediaUrl, tod: 'TOD2000', view: 'NI', coverUrl: '', duration },
    ] : [];
    return {
      userSongId: job.jobId, id: job.jobId, name: job.filename, filename: job.filename,
      audioUrl: mediaUrl, videoUrl: mediaUrl, videoByTodView,
      nameKey: job.jobId, performanceType: 'Solo', duration: job.info?.duration ?? 0, source: 'linli-nocturne',
    };
  }
}
