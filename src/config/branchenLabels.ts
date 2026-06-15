const LABELS: Record<string, string> = {
  sanitaer:       'Sanitär',
  sanitär:        'Sanitär',
  heizungsbauer:  'Heizungsbauer',
  fliesenleger:   'Fliesenleger',
  bodenleger:     'Bodenleger',
  dachdecker:     'Dachdecker',
  elektriker:     'Elektriker',
  schreiner:      'Schreiner',
  zimmermann:     'Zimmermann',
  zimmerer:       'Zimmerer',
  maurer:         'Maurer',
  maler:          'Maler',
  malermeister:   'Malermeister',
  gipser:         'Gipser',
  stuckateur:     'Stuckateur',
  glaser:         'Glaser',
  metallbau:      'Metallbau',
  metallbauer:    'Metallbauer',
  schlosser:      'Schlosser',
  gartenbau:      'Gartenbau',
  gartenbauer:    'Gartenbauer',
  reinigung:      'Reinigung',
  haustechnik:    'Haustechnik',
  haustechniker:  'Haustechniker',
  bauunternehmer: 'Bauunternehmer',
  generalunternehmer: 'Generalunternehmer',
};

export function branchenLabel(slug: string): string {
  return LABELS[slug.toLowerCase()] ?? (slug.charAt(0).toUpperCase() + slug.slice(1));
}

export function toOrtSlug(ort: string): string {
  return ort.trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
