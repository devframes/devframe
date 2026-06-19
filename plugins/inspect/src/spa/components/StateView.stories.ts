import type { Meta, StoryObj } from '@storybook/vue3';
import StateView from './StateView.vue';

const meta = {
  title: 'Inspector/StateView',
  component: StateView,
  tags: ['autodocs'],
  argTypes: {
    onSelect: { action: 'selected' },
  },
} satisfies Meta<typeof StateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    keys: [
      'devframe:docks',
      'devframe:commands',
      'app:config',
      'app:users',
    ],
    selectedKey: 'app:config',
    value: { theme: 'dark', version: '1.0.0' },
    loading: false,
    isStatic: false,
    updates: 5,
    highlightPaths: new Set(['theme']),
  },
};

export const Loading: Story = {
  args: {
    ...Default.args,
    loading: true,
  },
};

export const StaticSnapshot: Story = {
  args: {
    ...Default.args,
    isStatic: true,
    updates: 0,
  },
};

export const Empty: Story = {
  args: {
    keys: [],
    selectedKey: null,
    value: undefined,
    loading: false,
    isStatic: false,
    updates: 0,
    highlightPaths: new Set(),
  },
};
