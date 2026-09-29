import { test } from 'vitest';
import { backendCargo, backendReport, backendUnitCoverage, resetBackendCoverage } from '../tooling/backend-coverage';

// The full command freezes unit evidence before any integration or desktop execution.
test('unit coverage', () => {
  backendUnitCoverage(true);
}, 600000);

test('integration tests', () => {
  backendCargo(['test', '--locked', '--offline']);
}, 600000);

test('backend coverage report', () => {
  backendReport('coverage/backend', true);
}, 600000);

// Only the synthetic integration target may fill this deliberately missing unit path.
test('backend probe coverage', () => {
  backendUnitCoverage(false);
  backendCargo(['test', '--test', 'unit_coverage_probe', '--locked', '--offline']);
  backendReport('coverage/backend', false);
}, 600000);

test('reset backend probe', () => {
  resetBackendCoverage();
}, 600000);

test('backend JSON report', () => {
  backendReport('coverage/backend', false);
}, 600000);

test('unit JSON coverage', () => {
  backendUnitCoverage(false);
}, 600000);
