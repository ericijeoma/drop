// ════════════════════════════════════════════════════════════
// SHARED STYLES (referenced by multiple screens)
// In your actual project each screen has its own StyleSheet.
// Combined here for compactness.
// ════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  // Login
  loginContainer:   { paddingHorizontal: 24, gap: 16 },
  loginHeader:      { alignItems: 'flex-end', marginBottom: 8 },
  loginTitle:       { fontSize: 48, fontWeight: '800', letterSpacing: -2 },
  loginSubtitle:    { fontSize: 15, lineHeight: 22 },
  // Customer home
  homeContainer:    { paddingHorizontal: 20, gap: 16 },
  homeHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  greeting:         { fontSize: 13 },
  name:             { fontSize: 26, fontWeight: '700', marginTop: 2 },
  sectionTitle:     { fontSize: 20, fontWeight: '600', marginTop: 8 },
  serviceCard:      { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 16, borderWidth: 1, gap: 16 },
  serviceIcon:      { fontSize: 32 },
  serviceTextWrap:  { flex: 1, gap: 4 },
  serviceTitle:     { fontSize: 17, fontWeight: '600' },
  serviceDesc:      { fontSize: 13, lineHeight: 18 },
  historyLink:      { alignItems: 'center', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  historyText:      { fontSize: 15, fontWeight: '500' },
  // Book ride
  bookContainer:    { paddingHorizontal: 20, gap: 16 },
  screenTitle:      { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  sectionLabel:     { fontSize: 13, fontWeight: '500' },
  vehicleRow:       { flexDirection: 'row', gap: 12 },
  vehicleChip:      { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 2, gap: 6 },
  vehicleIcon:      { fontSize: 24 },
  vehicleLabel:     { fontSize: 13, fontWeight: '500' },
  // Driver dashboard
  dashHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  statusCard:       { padding: 20, borderRadius: 16, borderWidth: 1, gap: 8 },
  statusRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel:      { fontSize: 13 },
  statusValue:      { fontSize: 17, fontWeight: '600', marginTop: 2 },
  coordsText:       { fontSize: 11 },
  // Admin dashboard
  loading:          { textAlign: 'center', marginTop: 32, fontSize: 15 },
  statsGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard:         { width: '47%', padding: 16, borderRadius: 14, borderWidth: 1, gap: 4 },
  statValue:        { fontSize: 28, fontWeight: '700' },
  statLabel:        { fontSize: 12 },
});