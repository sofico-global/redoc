import { HistoryService } from '../HistoryService';
import { RedocNormalizedOptions } from '../RedocNormalizedOptions';

const options = new RedocNormalizedOptions({});

describe('History service', () => {
  function mockWindowLocationForSearch(): void {
    const mockResponse = jest.fn();
    Object.defineProperty(window, 'location', {
      value: {
        hash: {
          endsWith: mockResponse,
          includes: mockResponse,
        },
        assign: mockResponse,
      },
      writable: true,
    });
  }

  test('should be an instance', () => {
    const history = new HistoryService(options);
    expect(typeof history).not.toBe('function');
    expect(history.subscribe).toBeDefined();
  });

  test('History subscribe', () => {
    const fn = jest.fn();
    const history = new HistoryService(options);
    history.subscribe(fn);
    history.emit();
    expect(fn).toHaveBeenCalled();
  });

  test('History subscribe should return unsubscribe function', () => {
    const fn = jest.fn();
    const history = new HistoryService(options);
    const unsubscribe = history.subscribe(fn);
    history.emit();
    expect(fn).toHaveBeenCalled();
    unsubscribe();
    history.emit();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  describe('History with config property: `userQueryParamToNavigate` false', () => {
    test('currentId should return correct id', () => {
      window.location.hash = '#testid';
      const history = new HistoryService(options);
      expect(history.currentId).toEqual('testid');
    });

    test('should return correct link for id', () => {
      const history = new HistoryService(options);
      expect(history.linkForId('testid')).toEqual('#testid');
    });

    test('should return empty link for empty id', () => {
      const history = new HistoryService(options);
      expect(history.linkForId('')).toEqual('');
    });
  });

  describe('History with config property: `userQueryParamToNavigate` true', () => {
    const overrideOptions = new RedocNormalizedOptions({
      userQueryParamToNavigate: true,
    });

    test('currentId should return correct id', () => {
      mockWindowLocationForSearch();
      window.location.search = '?redoc=testid';
      const history = new HistoryService(overrideOptions);
      expect(history.currentId).toEqual('testid');
    });

    test('should return correct link for id', () => {
      const history = new HistoryService(overrideOptions);
      expect(history.linkForId('testid')).toEqual('?redoc=testid');
    });

    test('should return empty link for empty id', () => {
      const history = new HistoryService(overrideOptions);
      expect(history.linkForId('')).toEqual('');
    });
  });

  describe('History with config property: `eventDrivenNavigation` true', () => {
    const overrideOptions = new RedocNormalizedOptions({
      eventDrivenNavigation: true,
    });

    const nextTick = () => new Promise(resolve => setTimeout(resolve));

    test('currentId should not read the URL', () => {
      window.location.hash = '#testid';
      const history = new HistoryService(overrideOptions);
      expect(history.currentId).toEqual('');
    });

    test('should return inert link for id', () => {
      const history = new HistoryService(overrideOptions);
      expect(history.linkForId('testid')).toEqual('javascript:void(0)');
    });

    test('replace should dispatch redocPositionChanged instead of writing the URL', async () => {
      const dispatched: CustomEvent[] = [];
      const listener = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('redocPositionChanged', listener);
      const pushState = jest.spyOn(window.history, 'pushState');
      const replaceState = jest.spyOn(window.history, 'replaceState');

      const history = new HistoryService(overrideOptions);
      history.replace('testid', true);
      await nextTick();

      expect(dispatched).toHaveLength(1);
      expect(dispatched[0].detail).toEqual({ sectionId: 'testid' });
      expect(pushState).not.toHaveBeenCalled();
      expect(replaceState).not.toHaveBeenCalled();

      window.removeEventListener('redocPositionChanged', listener);
      pushState.mockRestore();
      replaceState.mockRestore();
    });

    test('replace with empty id should dispatch null sectionId', async () => {
      const dispatched: CustomEvent[] = [];
      const listener = (e: Event) => dispatched.push(e as CustomEvent);
      window.addEventListener('redocPositionChanged', listener);

      const history = new HistoryService(overrideOptions);
      history.replace('', true);
      await nextTick();

      expect(dispatched).toHaveLength(1);
      expect(dispatched[0].detail).toEqual({ sectionId: null });

      window.removeEventListener('redocPositionChanged', listener);
    });

    test('replace without rewriteHistory should also notify subscribers', async () => {
      const fn = jest.fn();
      const history = new HistoryService(overrideOptions);
      history.subscribe(fn);
      history.replace('testid');
      await nextTick();

      expect(fn).toHaveBeenCalledWith('testid');
    });
  });
});
