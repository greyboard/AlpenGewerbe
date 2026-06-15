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
