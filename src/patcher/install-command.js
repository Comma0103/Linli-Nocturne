const CONFIRMATION = 'Linli-Nocturne';

export function parseInstallArgs(args = [], env = {}) {
  const values = [...args];
  const help = values.includes('--help') || values.includes('-h');
  const apply = values.includes('--apply');
  const confirmation = values.find(value => value.startsWith('--confirm='))?.slice('--confirm='.length) ?? '';
  const unknown = values.filter(value => value.startsWith('-') && !['--help', '-h', '--apply'].includes(value) && !value.startsWith('--confirm='));
  if (unknown.length) throw new Error(`未知参数：${unknown.join(', ')}`);
  const positional = values.filter(value => !value.startsWith('-'));
  return {
    help,
    apply,
    confirmed: confirmation === CONFIRMATION,
    gameRoot: env.LINLI_GAME_ROOT ?? positional[0] ?? '',
    backupRoot: env.LINLI_BACKUP_ROOT ?? positional[1] ?? '',
    serviceUrl: env.LINLI_SERVICE_URL ?? 'http://127.0.0.1:27149',
  };
}

export const INSTALL_CONFIRMATION = CONFIRMATION;
