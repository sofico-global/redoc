import * as React from 'react';
import styled from '../../styled-components';

import { SampleControls } from '../../common-elements';
import { CopyButtonWrapper } from '../../common-elements/CopyButtonWrapper';
import { PrismDiv } from '../../common-elements/PrismDiv';
import { jsonToHTML } from '../../utils/jsonToHtml';
import { OptionsContext } from '../OptionsProvider';
import { jsonStyles } from './style';

export interface JsonProps {
  data: any;
  className?: string;
}

const JsonViewerWrap = styled.div`
  &:hover > ${SampleControls} {
    opacity: 1;
  }
`;

/**
 * Builds a path string for a collapsible element by looking at property keys in the DOM.
 */
function buildPathFromElement(collapsible: Element): string {
  const parts: string[] = [];
  let current: Element | null = collapsible.closest('li');

  while (current) {
    const propertySpan = current.querySelector(':scope > div > .property');
    if (propertySpan && propertySpan.textContent) {
      parts.unshift(propertySpan.textContent.replace(/"/g, ''));
    } else {
      const parent = current.parentElement;
      if (parent && parent.classList.contains('array')) {
        const index = Array.from(parent.children).indexOf(current);
        parts.unshift(`[${index}]`);
      }
    }
    const parentUl = current.parentElement?.closest('ul.collapsible');
    current = parentUl?.closest('li') || null;
  }

  return parts.join('.');
}

/**
 * Collects all EXPANDED paths from the current DOM state.
 */
function collectExpandedPaths(container: HTMLElement | undefined): Set<string> {
  const paths = new Set<string>();
  if (!container) return paths;

  const collapsibles = container.querySelectorAll('.collapsible');
  collapsibles.forEach(collapsible => {
    const parent = collapsible.parentElement;
    // Check if this is expanded (parent doesn't have 'collapsed' class)
    if (parent && !parent.classList.contains('collapsed')) {
      const path = buildPathFromElement(collapsible);
      if (path) {
        paths.add(path);
      }
    }
  });

  return paths;
}

/**
 * Restores expanded state based on saved paths.
 * By default everything starts collapsed based on jsonSamplesExpandLevel,
 * so we need to EXPAND the paths that were previously expanded.
 */
function restoreExpandedPaths(container: HTMLElement | undefined, paths: Set<string>): void {
  if (!container || paths.size === 0) return;

  const collapsibles = container.querySelectorAll('.collapsible');
  collapsibles.forEach(collapsible => {
    const path = buildPathFromElement(collapsible);
    const parent = collapsible.parentElement;
    const collapser = parent?.querySelector(':scope > .collapser');

    if (paths.has(path)) {
      // This path was expanded, make sure it's expanded
      parent?.classList.remove('collapsed');
      collapser?.setAttribute('aria-label', 'collapse');
    }
  });
}

const Json = (props: JsonProps) => {
  const [node, setNode] = React.useState<HTMLDivElement>();
  // Store expanded paths - updated on every user interaction
  const expandedPathsRef = React.useRef<Set<string>>(new Set());
  const prevDataRef = React.useRef<any>(undefined);

  // When node is available, set up mutation observer to track expand/collapse changes
  React.useEffect(() => {
    if (!node) return;

    // Save expanded state whenever the DOM changes (user clicks expand/collapse)
    const observer = new MutationObserver(() => {
      expandedPathsRef.current = collectExpandedPaths(node);
    });

    observer.observe(node, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });

    // Initial collection
    expandedPathsRef.current = collectExpandedPaths(node);

    return () => observer.disconnect();
  }, [node]);

  // Restore expanded state after data changes
  React.useLayoutEffect(() => {
    // Only restore if data actually changed (not on first render)
    if (prevDataRef.current !== undefined && prevDataRef.current !== props.data && node) {
      restoreExpandedPaths(node, expandedPathsRef.current);
    }
    prevDataRef.current = props.data;
  }, [props.data, node]);

  const renderInner = ({ renderCopyButton }) => {
    const showFoldingButtons =
      props.data &&
      Object.values(props.data).some(value => typeof value === 'object' && value !== null);

    return (
      <JsonViewerWrap>
        <SampleControls>
          {renderCopyButton()}
          {showFoldingButtons && (
            <>
              <button onClick={expandAll}> Expand all </button>
              <button onClick={collapseAll}> Collapse all </button>
            </>
          )}
        </SampleControls>
        <OptionsContext.Consumer>
          {options => (
            <PrismDiv
              tabIndex={0}
              className={props.className}
              // tslint:disable-next-line
              ref={node => setNode(node!)}
              dangerouslySetInnerHTML={{
                __html: jsonToHTML(props.data, options.jsonSamplesExpandLevel),
              }}
            />
          )}
        </OptionsContext.Consumer>
      </JsonViewerWrap>
    );
  };

  const expandAll = () => {
    const elements = node?.getElementsByClassName('collapsible');
    for (const collapsed of Array.prototype.slice.call(elements)) {
      const parentNode = collapsed.parentNode as Element;
      parentNode.classList.remove('collapsed');
      parentNode.querySelector('.collapser')!.setAttribute('aria-label', 'collapse');
    }
  };

  const collapseAll = () => {
    const elements = node?.getElementsByClassName('collapsible');
    const elementsArr = Array.prototype.slice.call(elements, 1);

    for (const expanded of elementsArr) {
      const parentNode = expanded.parentNode as Element;
      parentNode.classList.add('collapsed');
      parentNode.querySelector('.collapser')!.setAttribute('aria-label', 'expand');
    }
  };

  const collapseElement = (target: HTMLElement) => {
    let collapsed;
    if (target.className === 'collapser') {
      collapsed = target.parentElement!.getElementsByClassName('collapsible')[0];
      if (collapsed.parentElement.classList.contains('collapsed')) {
        collapsed.parentElement.classList.remove('collapsed');
        target.setAttribute('aria-label', 'collapse');
      } else {
        collapsed.parentElement.classList.add('collapsed');
        target.setAttribute('aria-label', 'expand');
      }
    }
  };

  const clickListener = React.useCallback((event: MouseEvent) => {
    collapseElement(event.target as HTMLElement);
  }, []);

  const focusListener = React.useCallback((event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      collapseElement(event.target as HTMLElement);
    }
  }, []);

  React.useEffect(() => {
    node?.addEventListener('click', clickListener);
    node?.addEventListener('focus', focusListener);
    return () => {
      node?.removeEventListener('click', clickListener);
      node?.removeEventListener('focus', focusListener);
    };
  }, [clickListener, focusListener, node]);

  return <CopyButtonWrapper data={props.data}>{renderInner}</CopyButtonWrapper>;
};

export const JsonViewer = styled(Json)`
  ${jsonStyles};
`;
