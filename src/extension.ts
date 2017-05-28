'use strict';
import * as vscode from 'vscode';
import * as request from './request-light/main'

export function activate(context: vscode.ExtensionContext) {
    let notification = new Notification()
    let controller = new NotificationController(notification);

    context.subscriptions.push(notification);
    context.subscriptions.push(controller);
}

export function deactivate() {
}

class NotificationController {
    private notification: Notification;
    private disposable: vscode.Disposable;

    constructor(_notification: Notification) {
        this.notification = _notification;

        let subscriptions: vscode.Disposable[] = [];
        vscode.workspace.onDidChangeConfiguration(this.onChangedConfiguration, this, subscriptions)

        this.disposable = vscode.Disposable.from(...subscriptions);
    }

    dispose() {
        this.disposable.dispose();
    }

    private onChangedConfiguration() {
        this.notification.setup()
    }
}

class Notification {
    private statusBarItem: vscode.StatusBarItem;

    private githubUsername: string
    private githubPassword: string

    private httpProxy: string
    private httpProxyStrictSSL: boolean

    constructor() {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        }
        this.setup()
        this.update()
    }

    setup() {
        console.log("Notification.setup")

        const githubNotificationConfiguration = vscode.workspace.getConfiguration("githubNotification")

        this.githubUsername = githubNotificationConfiguration.get<string>("username", "")
        this.githubPassword = githubNotificationConfiguration.get<string>("password", "")

        const httpConfiguration = vscode.workspace.getConfiguration("http")

        this.httpProxy = httpConfiguration.get<string>("proxy", "")
        this.httpProxyStrictSSL = httpConfiguration.get<boolean>("proxyStrictSSL", false)
    }

    update() {
        console.log("Notification.update")

        if (this.githubUsername == "" || this.githubPassword == "") {
            this.statusBarItem.hide()
            return
        }

        request.configure(this.httpProxy, this.httpProxyStrictSSL)

        console.log(Date.now())
        console.log(this.githubUsername)
        console.log(this.githubPassword)

        let response = request.xhr({
            type: "GET",
            url: "https://api.github.com/notifications",
            user: this.githubUsername,
            password: this.githubPassword,
            headers: {
                "User-Agent": "github-notifications"
            }
        })

        response.then((r) => {
            let interval = r.responseHeader["x-poll-interval"] * 1000

            console.log(r.status)
            console.log(JSON.parse(r.responseText))

            this.statusBarItem.text = "" + Date.now()
            this.statusBarItem.show();

            setTimeout(() => { this.update() }, interval)
        }).catch((e) => {
            //     this._statusBarItem.hide();
            console.log(e)
        })
    }

    dispose() {
        console.log("Notification.dispose")
        this.statusBarItem.dispose();
    }
}