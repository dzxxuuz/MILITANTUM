(() => {
  const tickerWindow = document.querySelector('.ticker-window');
  const track = document.querySelector('.ticker-track');
  const copies = track ? [...track.querySelectorAll('.ticker-copy')] : [];
  const item = copies[0]?.querySelector('.ticker-item');
  if (!tickerWindow || !track || copies.length !== 2 || !item) return;

  let resizePending = false;
  let previousDuration = '';

  function sizeTicker() {
    resizePending = false;
    const itemWidth = item.getBoundingClientRect().width;
    const windowWidth = tickerWindow.clientWidth;
    if (itemWidth <= 0 || windowWidth <= 0) return;
    const count = Math.ceil(windowWidth / itemWidth) + 1;

    copies.forEach((copy) => {
      while (copy.children.length < count) {
        const clone = item.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        copy.appendChild(clone);
      }
      while (copy.children.length > count) copy.lastElementChild.remove();
    });

    const groupWidth = copies[0].getBoundingClientRect().width;
    const duration = `${(groupWidth / 55).toFixed(3)}s`;
    if (duration !== previousDuration) {
      track.style.setProperty('--ticker-duration', duration);
      previousDuration = duration;
    }
  }

  function scheduleTickerSize() {
    if (resizePending) return;
    resizePending = true;
    window.requestAnimationFrame(sizeTicker);
  }

  if ('ResizeObserver' in window) {
    const tickerSize = new ResizeObserver(scheduleTickerSize);
    tickerSize.observe(tickerWindow);
    tickerSize.observe(item);
  } else {
    window.addEventListener('resize', scheduleTickerSize);
  }
  if (document.fonts) document.fonts.ready.then(scheduleTickerSize);
  scheduleTickerSize();
})();

(() => {
  const sections = [...document.querySelectorAll('.reveal-on-scroll')];
  if (!sections.length) return;

  const root = document.documentElement;
  root.classList.add('motion-ready');

  if (!('IntersectionObserver' in window)) {
    sections.forEach((section) => section.classList.add('is-revealed'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08 });

  sections.forEach((section) => observer.observe(section));
})();

const navigationLinks = [...document.querySelectorAll('.navigation a')];
const sections = navigationLinks.map((link) => document.querySelector(link.hash)).filter(Boolean);

function updateNavigation() {
  const threshold = window.innerHeight * 0.45;
  const positions = sections.map((section) => ({ id: section.id, top: section.getBoundingClientRect().top }));
  const reached = positions.filter((section) => section.top <= threshold);
  const closestTop = reached.length ? Math.max(...reached.map((section) => section.top)) : positions[0].top;
  const currentRow = positions.filter((section) => Math.abs(section.top - closestTop) < 2);
  const selected = currentRow.find((section) => `#${section.id}` === window.location.hash);
  const currentId = (selected || currentRow[0]).id;
  navigationLinks.forEach((link) => {
    const active = link.hash === `#${currentId}`;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

let navigationUpdatePending = false;
window.addEventListener('scroll', () => {
  if (navigationUpdatePending) return;
  navigationUpdatePending = true;
  window.requestAnimationFrame(() => {
    updateNavigation();
    navigationUpdatePending = false;
  });
}, { passive: true });
window.addEventListener('hashchange', () => {
  updateNavigation();
});
window.addEventListener('resize', () => {
  updateNavigation();
});
updateNavigation();

(() => {
  const audio = document.querySelector('#site-audio');
  const player = document.querySelector('#audio-player');
  const rows = [...document.querySelectorAll('.track-row[data-src]')];
  if (!audio || !player || !rows.length) return;

  const title = document.querySelector('#player-title');
  const artist = document.querySelector('#player-artist');
  const indexLabel = document.querySelector('#player-index');
  const toggle = document.querySelector('#player-toggle');
  const previous = document.querySelector('#player-previous');
  const next = document.querySelector('#player-next');
  const seek = document.querySelector('#player-seek');
  const volume = document.querySelector('#player-volume');
  const mute = document.querySelector('#player-mute');
  const currentTime = document.querySelector('#player-current');
  const durationLabel = document.querySelector('#player-duration');
  const status = document.querySelector('#player-status');
  const albumDuration = document.querySelector('#album-duration');
  const tracks = rows.map((row) => ({
    row,
    title: row.dataset.title,
    artist: row.dataset.artist,
    src: new URL(row.dataset.src, document.baseURI).href,
    duration: Number(row.dataset.duration) || 0,
  }));

  if ('ResizeObserver' in window) {
    const playerSize = new ResizeObserver(() => {
      if (!player.hidden) {
        document.documentElement.style.setProperty('--player-space', `${Math.ceil(player.getBoundingClientRect().height) + 16}px`);
      }
    });
    playerSize.observe(player);
  }

  let currentIndex = -1;
  let playRequest = 0;
  let wantsToPlay = false;
  let hasStartedPlaying = false;
  let lastAudibleVolume = 0.7;

  function formatTime(seconds) {
    const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  function selectedSourceIsCurrent() {
    return currentIndex >= 0 && audio.src === tracks[currentIndex].src
      && (!audio.currentSrc || audio.currentSrc === tracks[currentIndex].src);
  }

  function hasMetadata() {
    return selectedSourceIsCurrent() && audio.readyState >= 1
      && Number.isFinite(audio.duration) && audio.duration > 0;
  }

  function setStatus(message) {
    if (status.textContent !== message) status.textContent = message;
  }

  function updateTimeline() {
    const ready = hasMetadata();
    const duration = ready ? audio.duration : (tracks[currentIndex]?.duration || 0);
    const position = ready ? Math.min(Math.max(audio.currentTime || 0, 0), duration) : 0;
    const progress = ready ? position / duration : 0;
    currentTime.textContent = formatTime(position);
    durationLabel.textContent = formatTime(Math.round(duration));
    seek.disabled = !ready;
    seek.value = String(Math.round(progress * 1000));
    seek.style.setProperty('--progress', `${progress * 100}%`);
    seek.setAttribute('aria-valuetext', `${formatTime(position)} из ${formatTime(Math.round(duration))}`);
    previous.disabled = currentIndex < 0 || (currentIndex === 0 && position <= 3);
    next.disabled = currentIndex < 0 || currentIndex === tracks.length - 1;
  }

  function updatePlayback() {
    const playing = hasStartedPlaying && !audio.paused && !audio.ended && !audio.error;
    player.classList.toggle('is-playing', playing);
    rows.forEach((row, index) => {
      const active = index === currentIndex;
      const rowPlaying = active && playing;
      row.classList.toggle('is-current', active);
      row.classList.toggle('is-playing', rowPlaying);
      row.setAttribute('aria-pressed', String(rowPlaying));
      const label = `${rowPlaying ? 'Приостановить' : 'Воспроизвести'} «${tracks[index].title}»`;
      row.setAttribute('aria-label', label);
    });
    const label = playing ? 'Приостановить' : 'Воспроизвести';
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.title = label;
    updateTimeline();
  }

  function updateVolume() {
    const silent = audio.muted || audio.volume === 0;
    if (audio.volume > 0) lastAudibleVolume = audio.volume;
    const value = Math.round(audio.volume * 100);
    volume.value = String(value);
    volume.style.setProperty('--progress', `${silent ? 0 : value}%`);
    volume.setAttribute('aria-valuetext', silent ? 'Звук выключен' : `${value}%`);
    player.classList.toggle('is-muted', silent);
    mute.setAttribute('aria-pressed', String(silent));
    const label = silent ? 'Включить звук' : 'Выключить звук';
    mute.setAttribute('aria-label', label);
    mute.title = label;
  }

  function updateDurations() {
    if (hasMetadata()) {
      const track = tracks[currentIndex];
      track.duration = audio.duration;
      track.row.dataset.duration = String(audio.duration);
      const label = track.row.querySelector('.track-duration');
      if (label) label.textContent = formatTime(Math.round(audio.duration));
    }
    if (albumDuration) {
      albumDuration.textContent = formatTime(Math.round(tracks.reduce((sum, track) => sum + track.duration, 0)));
    }
    updateTimeline();
  }

  function showError(message) {
    playRequest += 1;
    wantsToPlay = false;
    hasStartedPlaying = false;
    audio.pause();
    setStatus(message);
    updatePlayback();
  }

  function pauseTrack() {
    playRequest += 1;
    wantsToPlay = false;
    hasStartedPlaying = false;
    audio.pause();
    setStatus('');
    updatePlayback();
  }

  async function playTrack() {
    if (currentIndex < 0) return;
    const request = ++playRequest;
    wantsToPlay = true;
    setStatus('Загрузка трека…');
    if (audio.error) audio.load();
    if (audio.ended && hasMetadata()) audio.currentTime = 0;
    try {
      await audio.play();
      if (request !== playRequest) return;
      updatePlayback();
    } catch (error) {
      // Changing tracks or pausing invalidates earlier play promises.
      if (request !== playRequest) return;
      const message = error.name === 'NotAllowedError'
        ? 'Браузер приостановил звук. Нажмите воспроизведение ещё раз.'
        : 'Не удалось воспроизвести трек. Попробуйте ещё раз или выберите следующий.';
      showError(message);
    }
  }

  function selectTrack(index, autoplay = true) {
    if (index < 0 || index >= tracks.length) return;
    playRequest += 1;
    wantsToPlay = false;
    hasStartedPlaying = false;
    audio.pause();
    currentIndex = index;
    const track = tracks[index];
    title.textContent = track.title;
    artist.textContent = track.artist;
    indexLabel.textContent = `${String(index + 1).padStart(2, '0')} / ${tracks.length}`;
    player.hidden = false;
    document.documentElement.classList.add('has-player');
    audio.src = track.src;
    audio.load();
    setStatus('');
    updatePlayback();
    if (autoplay) playTrack();
  }

  function toggleTrack() {
    if (currentIndex < 0) selectTrack(0);
    else if (wantsToPlay || !audio.paused) pauseTrack();
    else playTrack();
  }

  rows.forEach((row, index) => {
    row.addEventListener('click', () => {
      if (index === currentIndex) toggleTrack();
      else selectTrack(index);
    });
  });
  toggle.addEventListener('click', toggleTrack);
  previous.addEventListener('click', () => {
    if (currentIndex < 0) return;
    if (hasMetadata() && audio.currentTime > 3) {
      audio.currentTime = 0;
      updateTimeline();
    } else if (currentIndex > 0) {
      selectTrack(currentIndex - 1, wantsToPlay || !audio.paused);
    }
  });
  next.addEventListener('click', () => {
    if (currentIndex >= 0 && currentIndex < tracks.length - 1) {
      selectTrack(currentIndex + 1, wantsToPlay || !audio.paused);
    }
  });
  seek.addEventListener('input', () => {
    if (!hasMetadata()) return;
    audio.currentTime = Math.max(0, Math.min(1, Number(seek.value) / 1000)) * audio.duration;
    updateTimeline();
  });
  volume.addEventListener('input', () => {
    audio.volume = Math.max(0, Math.min(1, Number(volume.value) / 100));
    audio.muted = false;
    updateVolume();
  });
  mute.addEventListener('click', () => {
    if (audio.muted || audio.volume === 0) {
      if (audio.volume === 0) audio.volume = lastAudibleVolume;
      audio.muted = false;
    } else {
      audio.muted = true;
    }
    updateVolume();
  });

  audio.addEventListener('loadedmetadata', updateDurations);
  audio.addEventListener('durationchange', updateDurations);
  audio.addEventListener('timeupdate', updateTimeline);
  audio.addEventListener('volumechange', updateVolume);
  audio.addEventListener('playing', () => {
    if (!selectedSourceIsCurrent() || audio.paused || !wantsToPlay) return;
    hasStartedPlaying = true;
    setStatus('');
    updatePlayback();
  });
  audio.addEventListener('pause', () => {
    if (!audio.paused) return;
    wantsToPlay = false;
    hasStartedPlaying = false;
    updatePlayback();
  });
  audio.addEventListener('waiting', () => {
    if (selectedSourceIsCurrent() && wantsToPlay && !audio.paused) setStatus('Загрузка трека…');
  });
  audio.addEventListener('error', () => {
    if (!selectedSourceIsCurrent() || !audio.error) return;
    showError('Не удалось загрузить аудиофайл. Попробуйте ещё раз или выберите другой трек.');
  });
  audio.addEventListener('ended', () => {
    if (!selectedSourceIsCurrent() || !audio.ended) return;
    if (currentIndex < tracks.length - 1) {
      selectTrack(currentIndex + 1);
    } else {
      playRequest += 1;
      wantsToPlay = false;
      hasStartedPlaying = false;
      setStatus('Альбом прослушан.');
      updatePlayback();
    }
  });

  audio.volume = 0.7;
  updateVolume();
  updateDurations();
  updatePlayback();
})();
