export interface GroupStyle {
  label: string;
  hex: string;
  colorInt: number;
}

export const GROUP_STYLES: Record<string, GroupStyle> = {
  strategy: { label: 'Strategy', hex: '#38BDF8', colorInt: 0x38bdf8 },
  operations: { label: 'Operations', hex: '#F59E0B', colorInt: 0xf59e0b },
  finance: { label: 'Finance', hex: '#34D399', colorInt: 0x34d399 },
  clients: { label: 'Clients', hex: '#A78BFA', colorInt: 0xa78bfa },
  team: { label: 'Team', hex: '#FB7185', colorInt: 0xfb7185 },
  captures: { label: 'Captures', hex: '#FDE047', colorInt: 0xfde047 },
  general: { label: 'General', hex: '#94A3B8', colorInt: 0x94a3b8 },
};

export function getGroupStyle(group: string): GroupStyle {
  const key = group.toLowerCase();
  if (GROUP_STYLES[key]) return GROUP_STYLES[key];
  return {
    label: group.charAt(0).toUpperCase() + group.slice(1),
    hex: '#94A3B8',
    colorInt: 0x94a3b8,
  };
}
