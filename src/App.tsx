import { Navigate, Route, Router } from '@solidjs/router';
import { Match, onMount, Switch } from 'solid-js';
import { AppErrorBoundary } from './app/AppErrorBoundary';
import { type Services, ServicesProvider, useServices } from './app/ServicesContext';
import { createServices } from './app/services';
import { WorkspaceRoute } from './app/WorkspaceRoute';
import { MyTasksPage } from './features/my-tasks/MyTasksPage';
import { OfflineScreen } from './features/onboarding/OfflineScreen';
import { TokenScreen } from './features/onboarding/TokenScreen';
import { AppShell } from './features/shell/AppShell';
import { DEFAULT_WORKSPACE_ID } from './sync/session';

const TodayPage = () => <MyTasksPage filter="today" />;

function RedirectHome() {
  const { session } = useServices();
  return <Navigate href={`/${session.state.workspaceId ?? DEFAULT_WORKSPACE_ID}/my-work/tasks`} />;
}

export default function App(props: { services?: Services }) {
  const services = props.services ?? createServices();
  const { session } = services;
  onMount(() => void session.boot());

  return (
    <AppErrorBoundary>
      <ServicesProvider services={services}>
        <div data-testid="app-root" style={{ height: '100%' }}>
          <Switch>
            <Match when={session.state.status === 'needs-token'}>
              <TokenScreen />
            </Match>
            <Match when={session.state.status === 'offline-error'}>
              <OfflineScreen />
            </Match>
            <Match when={session.state.status === 'ready'}>
              <Router root={AppShell}>
                <Route path="/:workspaceId" component={WorkspaceRoute}>
                  <Route path="/my-work/tasks" component={MyTasksPage} />
                  <Route path="/my-work/today" component={TodayPage} />
                </Route>
                <Route path="*" component={RedirectHome} />
              </Router>
            </Match>
          </Switch>
        </div>
      </ServicesProvider>
    </AppErrorBoundary>
  );
}
