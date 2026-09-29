import { test } from 'vitest';
import { nativeCargo, nativeReport, nativeUnitCoverage, resetNativeCoverage } from '../tooling/native-coverage';

// The full command freezes unit evidence before any integration or desktop execution.
test('unit coverage', () => {
  nativeUnitCoverage(true);
}, 600000);

test('integration tests', () => {
  nativeCargo(['test', '--locked', '--offline']);
}, 600000);

test('native coverage report', () => {
  nativeReport('coverage/native', true);
}, 600000);

// Only the synthetic integration target may fill this deliberately missing unit path.
test('backend probe coverage', () => {
  nativeUnitCoverage(false);
  nativeCargo(['test', '--test', 'unit_coverage_probe', '--locked', '--offline']);
  nativeReport('coverage/native', false);
}, 600000);

test('reset native probe', () => {
  resetNativeCoverage();
}, 600000);

test('native JSON report', () => {
  nativeReport('coverage/native', false);
}, 600000);

test('unit JSON coverage', () => {
  nativeUnitCoverage(false);
}, 600000);
