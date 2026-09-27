import { test } from 'vitest';
import { nativeCargo, nativeReport, resetNativeCoverage } from '../scripts/native-coverage';

// The full command freezes unit evidence before any integration or desktop execution.
test('unit coverage', () => {
  resetNativeCoverage();
  nativeCargo(['test', '--lib', '--locked', '--offline']);
  nativeReport('coverage/native-unit', true);
}, 600000);

test('integration tests', () => {
  nativeCargo(['test', '--locked', '--offline']);
}, 600000);

test('native coverage report', () => {
  nativeReport('coverage/native', true);
}, 600000);
