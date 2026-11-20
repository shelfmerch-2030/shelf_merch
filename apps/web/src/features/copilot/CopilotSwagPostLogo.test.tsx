// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SwagStepMessage } from './SwagStepMessage';
import { CopilotWriteSuccess } from './CopilotConfirmationCard';
import type { SwagState } from './swagApi';
afterEach(cleanup);
const state: SwagState = { conversationId: 'test', revision: 4, active: true, name: 'Team', step: 'design',
  artwork: 'upload', artworkName: 'logo.png', artworkStatus: 'Logo uploaded', automaticArtworkAvailable: true,
  productIds: ['polo','mug'], products: [{id:'polo',name:'Team Polo'}, {id:'mug',name:'Ceramic Mug'}], shopIds: [], stores: [], designs: [],
  persisted: false, designReady: false, hasUnsavedChanges: true };
function show(overrides: Partial<SwagState> = {}, extra = {}) {
  const props = { state: {...state,...overrides}, busy: false, hasCatalog: false, hasComposerLogo: true,
    change: vi.fn(), edit: vi.fn(), prepare: vi.fn(), browse: vi.fn(), search: vi.fn(), upload: vi.fn(), ...extra };
  render(<SwagStepMessage {...props} />); return props;
}
it('leaves supported application to the conversation after upload', () => {
  const props=show();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  for(const label of ['Open designer','Choose another product','Continue without artwork','Change logo','Save for later','Change products','More design options']) expect(screen.queryByText(label)).not.toBeInTheDocument();
  expect(props.prepare).not.toHaveBeenCalled(); expect(props.change).not.toHaveBeenCalled();
});
it('keeps the normal prompt free of review buttons during a pending request', () => {
  const props=show({}, {busy:true});
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(props.prepare).not.toHaveBeenCalled();
});
it.each([{automaticArtworkAvailable:false}, {automaticArtworkAvailable:true}])('offers a single save approval for genuine manual fallback: %j', override => {
  const props=show(override,{mode:'manual'});
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Open designer'})); expect(props.prepare).toHaveBeenCalledWith('save');
});
it('shows only persisted product-specific mockups and identifies products with no customized preview', () => {
  show({artwork:'saved',persisted:true,designReady:true,hasUnsavedChanges:false,designs:[{productId:'polo',mockupUrl:'/uploads/polo-saved.png'},{productId:'mug',mockupUrl:''}]});
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(screen.getByAltText('Saved design for Team Polo')).toHaveAttribute('src','/uploads/polo-saved.png');
  expect(screen.getByText(/Without a saved customized preview: Ceramic Mug/)).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(screen.queryByText('More design options')).not.toBeInTheDocument();
});
it('places the next conversational question below the persisted mockup gallery after confirmed application', () => {
  render(<CopilotWriteSuccess artifact={{ kind: 'success', operation: 'swag.collection', message: 'Applied', result: {
    action: 'apply', application: { targets: [{ productId: 'polo' }, { productId: 'mug' }] }, products: state.products,
    designs: [{ productId: 'polo', mockupUrl: '/uploads/polo-saved.png' }, { productId: 'mug', mockupUrl: '/uploads/mug-saved.png' }],
  } }} />);
  show({artwork:'saved',persisted:true,designReady:true,hasUnsavedChanges:false,designs:[{productId:'polo',mockupUrl:'/uploads/polo-saved.png'},{productId:'mug',mockupUrl:'/uploads/mug-saved.png'}]},{mode:'applied'});
  const question=screen.getByText('Do these designs look good? Would you like to publish them or make changes?');
  expect(screen.getByLabelText('Saved design previews').compareDocumentPosition(question)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getAllByRole('img')).toHaveLength(2); expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('keeps the existing paused resume action and no-artwork progression', () => {
  const props=show({}, {mode:'paused'}); fireEvent.click(screen.getByRole('button',{name:'Continue designing'})); expect(props.change).toHaveBeenCalledWith({step:'design',interaction:'resume'});
  cleanup(); const skipped=show({artwork:'none',designReady:true}); fireEvent.click(screen.getByRole('button',{name:'Looks good'})); expect(skipped.change).toHaveBeenCalledWith({step:'stores'});
});
it('offers the verified existing designer only when requested and without another save for an unchanged saved design', () => {
  const props=show({artwork:'saved',persisted:true,designReady:true,hasUnsavedChanges:false,editorPath:'/swag/new?edit=1234567890abcdef12345678'},{mode:'designer'});
  expect(screen.getByRole('link',{name:'Open designer'}).getAttribute('href')).toContain('/swag/new?edit=1234567890abcdef12345678');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();expect(props.prepare).not.toHaveBeenCalled();
});
