// ────────────────────────────────────────────────────────────
// src/components/Input/AddressInput.tsx
// Address search input using Nominatim (OpenStreetMap).
// Debounced to reduce API calls on 3G.
// ────────────────────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react';
import { View, TextInput, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@/shared/lib/theme';
import type { AddressWithCoords } from '@/shared/types';

interface AddressInputProps {
  label:        string;
  placeholder?: string;
  onSelect:     (result: AddressWithCoords) => void;
  error?:       string;
}

interface NominatimResult {
  display_name: string;
  lat:          string;
  lon:          string;
}

export function AddressInput({ label, placeholder, onSelect, error }: AddressInputProps) {
  const theme                 = useTheme();
  const [text,    setText]    = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (query: string) => {
    if (query.length < 3) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=ng`,
        { headers: { 'User-Agent': 'Drop-App/1.0' } }
      );
      const data = await res.json() as NominatimResult[];
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 600); // 600ms debounce for 3G
  };

  const handleSelect = (item: NominatimResult) => {
    setText(item.display_name);
    setResults([]);
    onSelect({
      address: item.display_name,
      coords: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
    });
  };

  const borderColor = error ? theme.danger : focused ? theme.brand : theme.border;

  return (
    <View>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={[styles.inputWrap, { borderColor, backgroundColor: theme.surface }]}>
        <TextInput
          value={text}
          onChangeText={handleChange}
          placeholder={placeholder ?? `Search ${label.toLowerCase()}...`}
          placeholderTextColor={theme.textTertiary}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, { color: theme.text }]}
          accessible
          accessibilityLabel={`${label} address search`}
          accessibilityHint={`Type an address to search. Results will appear below.`}
          returnKeyType="search"
          autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color={theme.brand} style={styles.loader} />}
      </View>
      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(_, i) => String(i)}
          style={[styles.dropdown, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          keyboardShouldPersistTaps="handled"
          accessible
          accessibilityLabel="Address search results"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelect(item)}
              style={[styles.result, { borderBottomColor: theme.border }]}
              accessible
              accessibilityRole="button"
              accessibilityLabel={item.display_name}
              accessibilityHint="Double tap to select this address"
            >
              <Text style={[styles.resultText, { color: theme.text }]} numberOfLines={2}>
                {item.display_name}
              </Text>
            </Pressable>
          )}
        />
      )}
      {error && (
        <Text style={[styles.error, { color: theme.danger }]} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label:     { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, height: 52 },
  input:     { flex: 1, fontSize: 15 },
  loader:    { marginLeft: 8 },
  dropdown:  { borderWidth: 1, borderRadius: 12, marginTop: 2, maxHeight: 200, overflow: 'hidden' },
  result:    { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  resultText:{ fontSize: 13, lineHeight: 18 },
  error:     { fontSize: 12, marginTop: 4 },
});


