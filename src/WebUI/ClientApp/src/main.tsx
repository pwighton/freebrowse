import { MainRouter } from '@/MainRouter';
import '@/index.css';
import { NewPointSetDialog } from '@/pages/project/dialogs/newPointSet/NewPointSetDialog';
import { OpenProjectDialog } from '@/pages/project/dialogs/openProject/OpenProjectDialog';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactNotifications } from 'react-notifications-component';
import 'react-notifications-component/dist/theme.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<ReactNotifications />
		<OpenProjectDialog>
			<NewPointSetDialog>
				<MainRouter />
			</NewPointSetDialog>
		</OpenProjectDialog>
	</React.StrictMode>
);
