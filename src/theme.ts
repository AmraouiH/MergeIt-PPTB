import { createDarkTheme, createLightTheme, type BrandVariants, type Theme } from '@fluentui/react-components';

/**
 * MergeIt themes: an indigo brand ramp on top of balanced neutrals.
 * Light is a soft blue-grey (no glaring white canvas); dark is a "dim" slate rather than near-black.
 */

const indigo: BrandVariants = {
    10: '#08081f',
    20: '#11123b',
    30: '#1a1c57',
    40: '#232671',
    50: '#2d308b',
    60: '#373ba6',
    70: '#4247c1',
    80: '#5056d9',
    90: '#6066e6',
    100: '#7177ec',
    110: '#8388f0',
    120: '#959af3',
    130: '#a8acf6',
    140: '#bbbef8',
    150: '#ced0fb',
    160: '#e2e3fd',
};

export const mergeItLightTheme: Theme = {
    ...createLightTheme(indigo),
    colorNeutralBackground1: '#ffffff',
    colorNeutralBackground1Hover: '#f3f5fa',
    colorNeutralBackground1Pressed: '#e9edf5',
    colorNeutralBackground1Selected: '#eceff7',
    colorNeutralBackground2: '#eef1f7',
    colorNeutralBackground3: '#f5f7fb',
    colorNeutralBackground4: '#e9edf4',
    colorNeutralForeground1: '#1f2937',
    colorNeutralForeground2: '#374151',
    colorNeutralForeground3: '#64748b',
    colorNeutralForeground4: '#94a3b8',
    colorNeutralStroke1: '#cfd6e3',
    colorNeutralStroke1Hover: '#b8c1d1',
    colorNeutralStroke2: '#dfe4ed',
    colorNeutralStroke3: '#edf0f5',
    colorNeutralStrokeAccessible: '#7a8599',
};

export const mergeItDarkTheme: Theme = {
    ...createDarkTheme(indigo),
    colorBrandForeground1: indigo[120],
    colorBrandForeground2: indigo[130],
    colorBrandForegroundLink: indigo[120],
    colorNeutralBackground1: '#353b48',
    colorNeutralBackground1Hover: '#3d4452',
    colorNeutralBackground1Pressed: '#323845',
    colorNeutralBackground1Selected: '#414857',
    colorNeutralBackground2: '#2b303b',
    colorNeutralBackground3: '#3a4150',
    colorNeutralBackground4: '#2f3542',
    colorNeutralBackgroundDisabled: '#3a404c',
    colorNeutralForeground1: '#e9ecf2',
    colorNeutralForeground2: '#d3d8e2',
    colorNeutralForeground3: '#aab3c3',
    colorNeutralForeground4: '#8892a4',
    colorNeutralForegroundDisabled: '#7a8394',
    colorNeutralStroke1: '#566074',
    colorNeutralStroke1Hover: '#667186',
    colorNeutralStroke2: '#4a5365',
    colorNeutralStroke3: '#414959',
    colorNeutralStrokeAccessible: '#9aa3b4',
    colorNeutralStrokeDisabled: '#4a5263',
    colorSubtleBackgroundHover: '#3f4655',
    colorSubtleBackgroundPressed: '#363c49',
    colorTransparentBackgroundHover: '#3f4655',
    colorNeutralShadowAmbient: 'rgba(0, 0, 0, 0.18)',
    colorNeutralShadowKey: 'rgba(0, 0, 0, 0.22)',
};
