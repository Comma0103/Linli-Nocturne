// Client 0.0.9.627 uses numeric MIDI states; domain/storage states stay textual.
const CLIENT_STATES = Object.freeze({ pending: 1, running: 2, finished: 3, canceled: 4, failed: 5 });

export function clientMidiJob(job) {
  if (!job) return { state: CLIENT_STATES.failed, error: 'job_not_found' };
  const { mediaPath, ...visible } = job;
  return { ...visible, state: CLIENT_STATES[job.state] ?? CLIENT_STATES.failed };
}

export function clientMidiPage(page) {
  return { ...page, list: page.list.map(clientMidiJob) };
}

export function midiPageParams(params) {
  return { pageSize: params.get('page_size') ?? params.get('pageSize'), cursor: params.get('cursor') };
}

export function midiJobIds(params) {
  // The original client serializes snake_case arrays as repeated query keys.
  return [...params.getAll('job_ids'), ...params.getAll('job_ids[]'), ...params.getAll('jobIds'), ...params.getAll('jobIds[]')]
    .flatMap(value => value.split(',')).filter(Boolean);
}
