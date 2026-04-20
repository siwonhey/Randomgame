import { state } from './state.js';

export function saveToLocalStorage() {
  const data = {
    participants: state.participants.map(p => p.name),
    eventTitle: document.getElementById('event-title').value,
  };
  localStorage.setItem('metalBlade', JSON.stringify(data));
}

export function loadFromLocalStorage(addParticipant) {
  const params = new URLSearchParams(window.location.search);
  const urlNames = params.get('names');
  const urlTitle = params.get('title');

  if (urlNames) {
    document.getElementById('event-title').value = urlTitle || '';
    urlNames.split(',').forEach(n => addParticipant(decodeURIComponent(n)));
    return;
  }

  try {
    const raw = localStorage.getItem('metalBlade');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.eventTitle) document.getElementById('event-title').value = data.eventTitle;
    if (data.participants) data.participants.forEach(n => addParticipant(n));
  } catch {
    /* corrupt data */
  }
}
