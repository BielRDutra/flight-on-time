import React from 'react';

interface HostProps {
  children?: React.ReactNode;
  [key: string]: unknown;
}

function createHostComponent(hostName: string, defaultProps: Record<string, unknown> = {}) {
  return function HostComponent({ children, ...props }: HostProps) {
    return React.createElement(hostName, { ...defaultProps, ...props }, children);
  };
}

export const View = createHostComponent('View');
export const Text = createHostComponent('Text');
export const Pressable = createHostComponent('View', { accessible: true });
export const ScrollView = createHostComponent('RCTScrollView');
export const ActivityIndicator = createHostComponent('View', { accessible: true });
export const TextInput = createHostComponent('TextInput', { accessible: true });

export function Switch({
  value,
  onValueChange,
  ...props
}: HostProps & { value?: boolean; onValueChange?: (next: boolean) => void }) {
  return React.createElement('RCTSwitch', {
    accessible: true,
    role: 'switch',
    value,
    onPress: () => onValueChange?.(!value),
    onValueChange,
    ...props,
  });
}

export const Platform = {
  OS: 'web',
  select: <T,>(options: { web?: T; android?: T; default?: T }): T | undefined =>
    options.web ?? options.default,
};

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: (style: unknown): Record<string, unknown> => {
    if (!style) {
      return {};
    }
    if (Array.isArray(style)) {
      return Object.assign(
        {},
        ...style
          .flat(Infinity)
          .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')),
      );
    }
    return typeof style === 'object' ? (style as Record<string, unknown>) : {};
  },
};
