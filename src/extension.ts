'use strict'
import * as vscode from 'vscode'
import * as request from './request-light/main'
import * as opn from 'opn'

const cmdListGitHubNotifications: string = 'github-notifications.list'

export function activate(context: vscode.ExtensionContext) {
    let notifications = new Notifications()
    let controller = new Controller(notifications)

    context.subscriptions.push(notifications)
    context.subscriptions.push(controller)

    let disposable = vscode.commands.registerCommand(cmdListGitHubNotifications, () => {
        notifications.list()
    })

    context.subscriptions.push(disposable)
}

export function deactivate() {
}

class Controller {
    private notifications: Notifications
    private disposable: vscode.Disposable

    constructor(_notifications: Notifications) {
        this.notifications = _notifications

        let subscriptions: vscode.Disposable[] = []
        vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this, subscriptions)

        this.disposable = vscode.Disposable.from(...subscriptions)
    }

    dispose() {
        this.disposable.dispose()
    }

    private onDidChangeConfiguration() {
        this.notifications.setup()
    }
}

class Notifications {
    private statusBarItem: vscode.StatusBarItem
    private xhrOptions: request.XHROptions | null
    private timerId: NodeJS.Timer
    private commands: Map<vscode.QuickPickItem, string>

    constructor() {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right)
            this.statusBarItem.command = cmdListGitHubNotifications
            this.statusBarItem.text = "$(bell)"
        }
        this.timerId = null

        this.setup()
    }

    setup() {
        const githubNotificationConfiguration = vscode.workspace.getConfiguration("githubNotification")
        const httpConfiguration = vscode.workspace.getConfiguration("http")

        const githubUsername = githubNotificationConfiguration.get<string>("username")
        const githubPassword = githubNotificationConfiguration.get<string>("password")
        const githubUrl = githubNotificationConfiguration.get<string>("url")

        const httpProxy = httpConfiguration.get<string>("proxy", "")
        const httpProxyStrictSSL = httpConfiguration.get<boolean>("proxyStrictSSL", false)

        request.configure(httpProxy, httpProxyStrictSSL)

        if (githubUsername != "" && githubPassword != "") {
            this.xhrOptions = {
                type: "GET",
                url: githubUrl,
                user: githubUsername,
                password: githubPassword,
                headers: {
                    "User-Agent": "github-notifications"
                }
            }
        } else {
            this.xhrOptions = null
        }

        if (this.timerId != null) {
            clearTimeout(this.timerId)
            this.timerId = null
        }

        this.check()
    }

    open(r: request.XHRResponse) {
        let comment = JSON.parse(r.responseText)
        let html_url = comment.html_url
        if (html_url !== undefined) {
            opn(html_url)
        }
    }

    list() {
        if (this.commands.size > 0) {
            let commands: vscode.QuickPickItem[] = []
            for (let command of this.commands.keys()) {
                commands.push(command)
            }
            commands = commands.sort()

            vscode.window.showQuickPick(commands)
                .then((r) => {
                    let latest_comment_url: string = this.commands.get(r)
                    if (latest_comment_url !== undefined && this.xhrOptions != null) {
                        let xhrOptions = {
                            type: "GET",
                            url: latest_comment_url,
                            user: this.xhrOptions.user,
                            password: this.xhrOptions.password,
                            headers: this.xhrOptions.headers,
                        }

                        request.xhr(xhrOptions)
                            .then((r) => {
                                this.open(r)
                            })
                            .catch((e) => {
                                console.log(e)
                            })
                    }
                })
        }
    }

    check() {
        if (this.xhrOptions != null) {
            this.statusBarItem.show()
            request.xhr(this.xhrOptions)
                .then((r) => {
                    this.update(r)
                }).catch((e) => {
                    this.error(e)
                })
        }
        else {
            this.statusBarItem.hide()
        }
    }

    update(r: request.XHRResponse) {
        const interval = r.responseHeader["x-poll-interval"] * 1000
        const threads = JSON.parse(r.responseText)

        // const threads = [
        //     {
        //         repository: {
        //             full_name: "maxbet1507/github-notifications"
        //         },
        //         subject: {
        //             title: "Test Pull-Request",
        //             type: "PullRequest",
        //             latest_comment_url: "",
        //         }
        //     },
        //     {
        //         repository: {
        //             full_name: "maxbet1507/github-notifications"
        //         },
        //         subject: {
        //             title: "Test Issue",
        //             type: "Issue",
        //             latest_comment_url: "",
        //         }
        //     }
        // ]

        let commands = new Map<vscode.QuickPickItem, string>()
        for (let thread of threads) {
            let repository_full_name: string = thread.repository.full_name
            let subject_type: string = thread.subject.type
            let subject_title: string = thread.subject.title
            let subject_comment_url: string = thread.subject.latest_comment_url

            let command: vscode.QuickPickItem = {
                label: subject_title,
                description: repository_full_name,
            }

            switch (subject_type.toLowerCase()) {
                case "issue":
                    command.label = "$(issue-opened) " + command.label
                    break
                case "pullrequest":
                    command.label = "$(git-pull-request) " + command.label
                    break
                default:
                    command.label = "$(mark-github) " + command.label
            }

            if (!commands.has(command)) {
                commands.set(command, subject_comment_url)
            }
        }

        if (commands.size > 0) {
            this.statusBarItem.text = "$(bell) " + commands.size
        }
        else {
            this.statusBarItem.text = "$(bell)"
        }
        this.statusBarItem.tooltip = "Last checked: " + r.responseHeader["date"]

        console.log(r)

        this.commands = commands
        this.timerId = setTimeout(() => { this.check() }, interval)
    }

    error(e: any) {
        const interval = 5 * 1000

        console.log(e)

        this.timerId = setTimeout(() => { this.check() }, interval)
    }

    dispose() {
        this.statusBarItem.dispose()
    }
}