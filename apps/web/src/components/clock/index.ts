export { Clock, type ClockProps } from './Clock';
export { ClockConfigForm, type ClockConfigFormProps, type ClockConfigValue } from './ClockConfigForm';
export { ClockController, CLOCK_TICK_MS, isManaged, type ClockControllerDeps } from './ClockController';
export { clockController } from './clockService';
export { CUSTOM_PRESET_ID, clockCategory, describeClockConfig, resolveClockConfig } from './clockConfig';
export { registerClockSlots } from './ClockSlots';
export { installClockFeature } from './install';
