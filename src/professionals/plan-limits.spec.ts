import { fitToLimit } from './plan-limits';

interface Item {
  id: string;
  visible: boolean;
  pinned?: boolean;
}
const ids = (items: Item[]) => items.map((item) => item.id);
const visible = (item: Item) => item.visible;
const pinned = (item: Item) => item.pinned === true;

describe('fitToLimit (ADR 0026)', () => {
  // Del más viejo al más nuevo.
  const items: Item[] = [
    { id: 'a', visible: true },
    { id: 'b', visible: true },
    { id: 'c', visible: true },
    { id: 'd', visible: true },
  ];

  it('al bajar de plan oculta primero lo más reciente', () => {
    expect(ids(fitToLimit(items, 2, visible).hide)).toEqual(['c', 'd']);
  });

  it('lo fijo (la profesión principal) se queda aunque sea lo más nuevo', () => {
    const withPrimary = [...items.slice(0, 3), { id: 'd', visible: true, pinned: true }];
    expect(ids(fitToLimit(withPrimary, 2, visible, pinned).hide)).toEqual(['b', 'c']);
  });

  it('al subir de plan vuelve lo oculto, del más viejo al más nuevo, hasta el límite', () => {
    const hidden: Item[] = [
      { id: 'a', visible: true },
      { id: 'b', visible: false },
      { id: 'c', visible: false },
      { id: 'd', visible: false },
    ];
    expect(fitToLimit(hidden, 3, visible)).toEqual({
      hide: [],
      show: [hidden[1], hidden[2]],
    });
  });

  it('dentro del límite no cambia nada', () => {
    expect(fitToLimit(items, 4, visible)).toEqual({ hide: [], show: [] });
  });
});
