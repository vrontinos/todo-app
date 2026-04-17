// Κανονικοποίηση ελληνικού κειμένου για συγκρίσεις και αναζήτηση
export function normalizeGreekText(value) {
  return String(value || '')
    .toLocaleLowerCase('el-GR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // αφαιρεί τόνους/διαλυτικά
    .replace(/ς/g, 'σ')              // τελικό σίγμα -> σ
    .replace(/[΄'`´]/g, '')          // αφαιρεί περίεργους τόνους/αποστρόφους
    .replace(/\s+/g, ' ')            // μαζεύει πολλαπλά κενά
    .trim()
}