define('app/views/machine_monitoring',
    [
        'app/views/templated',
        'app/models/graph',
        'app/models/datasource'
    ],
    //
    //  Machine Monitoring View
    //
    //  @returns Class
    //
    function (TemplatedView, Graph, Datasource) {

        'use strict';

        return TemplatedView.extend({


            //
            //
            //  Properties
            //
            //


            rules: [],
            graphs: [],
            metrics: [],
            machine: null,
            gettingCommand: null,


            //
            //
            //  Initialization
            //
            //


            load: function () {

                // Add event handlers
                Mist.rulesController.on('onRuleAdd', this, '_ruleAdded');
                Mist.rulesController.on('onRuleDelete', this, '_ruleDeleted');
                Mist.metricsController.on('onMetricAdd', this, '_metricAdded');
                Mist.metricsController.on('onMetricDelte', this, '_metricDeleted');
                Mist.metricsController.on('onMetricDisassociate', this, '_metricDeleted');

            }.on('didInsertElement'),


            unload: function () {

                // Remove event handlers
                Mist.rulesController.off('onRuleAdd', this, '_ruleAdded');
                Mist.rulesController.off('onRuleDelete', this, '_ruleDeleted');
                Mist.metricsController.off('onMetricAdd', this, '_metricAdded');
                Mist.metricsController.off('onMetricDelte', this, '_metricDeleted');
                Mist.metricsController.off('onMetricDisassociate', this, '_metricDeleted');

                this._clear();
                this._hideGraphs();
            }.on('willDestroyElement'),



            showMonitoring: function () {
                this._clear();
                this._updateRules();
                this._updateMetrics();
                this._updateGraphs();
                this._showGraphs();
            },


            hideMonitoring: function () {
                this._hideGraphs();
                this._clear();
            },


            //
            //
            //  Methods
            //
            //


            addGraphClicked: function () {
                Mist.metricAddController.open(this.machine);
            },


            //
            //
            //  Actions
            //
            //


            actions: {

                enableMonitoringClicked: function () {

                    // Make sure user is logged in
                    if (!Mist.authenticated)
                        Mist.loginController.open();

                    // Make sure user has purchased a plan
                    else if (!Mist.current_plan)
                        this._showMissingPlanMessage();

                    // Make sure machine has a key
                    else if (!this.machine.probed)
                        this._showManualMonitoringCommand();

                    // Confrim to enable monitoring
                    else
                        this._showEnableMonitoringConfirmation();
                },


                disableMonitoringClicked: function () {
                    var machine = this.machine;
                    Mist.dialogController.open({
                        type: DIALOG_TYPES.YES_NO,
                        head: 'Disable monitoring',
                        body: [
                            {
                                paragraph: 'Are you sure you want to disable ' +
                                    'monitoring for this machine?'
                            }
                        ],
                        callback: disableMonitoring
                    });

                    function disableMonitoring (didConfirm) {

                        if (!didConfirm) return;

                        // Removing a bunch of graphs from the user's face
                        // feels clumpsy. So we scroll to top and present a
                        // nice message while disabling monitoring

                        Mist.smoothScroll(0, 50);

                        // Disable monitoring after a while to enalbe
                        // smoothScroll to scroll to top
                        Ember.run.later(function () {
                            Mist.monitoringController
                                .disableMonitoring(machine,
                                    function (success) {
                                        if (success)
                                            Mist.graphsController.close();
                                    }
                                );
                        }, 200);
                    }
                },


                addRuleClicked: function() {
                    Mist.rulesController.newRule(this.machine);
                },


                //
                // Proxy actions for graph list control view
                //


                backClicked: function () {
                    Mist.graphsController.history.goBack();
                },


                forwardClicked: function () {
                    Mist.graphsController.history.goForward();
                },


                resetClicked: function () {
                    Mist.graphsController.stream.start();
                },


                pauseClicked: function () {
                    Mist.graphsController.stream.stop();
                },


                timeWindowChanged: function () {
                    var newTimeWindow = $('#time-window-control select').val();
                    Mist.graphsController.resolution.change(newTimeWindow);

                    // Update cookie
                    var entry = Mist.cookiesController.getSingleMachineEntry(
                        this.machine);
                    entry.timeWindow = newTimeWindow;
                    Mist.cookiesController.setSingleMachineEntry(
                        this.machine, entry);
                },


                //
                //  Proxy actions for graph list bar
                //


                addGraphClicked: function () {
                    this.addGraphClicked();
                },


                graphButtonClicked: function (graph) {
                    graph.view.set('isHidden', false);

                    // Update cookie
                    var entry = Mist.cookiesController.getSingleMachineGraphEntry(
                        this.machine, graph).hidden = false;
                    Mist.cookiesController.save();

                    // Manipulate DOM

                    moveGraphToEnd(graph.id);
                    Ember.run.later(function () {
                        moveGraphButtonToEnd(graph.id);
                    }, 400);
                },


                //
                //  Proxy actions for graph list item
                //


                collapseClicked: function (graph) {
                    graph.view.set('isHidden', true);

                    // Update cookie
                    // shift indexes and set this collapsed graph to be
                    // the last one
                    var graphs = Mist.cookiesController.getSingleMachineEntry(
                        this.machine).graphs;
                    var lastIndex = this.metrics.length - 1;
                    var e;
                    forIn(graphs, function (entry) {
                        if (entry.index == graph.index)
                            e = entry;
                        else if (entry.index > graph.index)
                            entry.index -= 1;
                    });
                    e.index = lastIndex;
                    e.hidden = true;
                    graph.set('index', lastIndex);
                    Mist.cookiesController.save();

                    // Manipulate DOM
                    moveGraphButtonToEnd(graph.id);
                    Ember.run.later(function () {
                        moveGraphToEnd(graph.id);
                    }, 400);
                },


                removeClicked: function (graph) {

                    var machine = this.machine;
                    var message = 'Are you sure you want to remove "' +
                        graph.datasources[0].metric.name + '"';
                    var metric = graph.datasources[0].metric;

                    if (metric.isPlugin)
                        message += ' and disable it from server ' + machine.name;
                    message += ' ?';

                    function removeGraph (success) {
                        if (success)
                            Mist.metricsController.disassociateMetric(
                                metric,
                                machine,
                                function (success) {
                                    if (success)
                                        Mist.graphsController.content.removeObject(graph);
                                }
                            );
                        else
                            graph.set('pendingRemoval', false);
                    }

                    Mist.dialogController.open({
                        type: DIALOG_TYPES.YES_NO,
                        head: 'Remove graph',
                        body: [
                            {
                                paragraph: message
                            }
                        ],
                        callback: function (didConfirm) {
                            if (didConfirm) {
                                graph.set('pendingRemoval', true);
                                if (metric.isPlugin)
                                    Mist.metricsController.disableMetric(
                                        metric, machine, removeGraph);
                                else
                                    removeGraph(true);
                            }
                        }
                    })
                }
            },


            //
            //
            //  Pseudo-Private Methods
            //
            //


            _clear: function () {
                this.setProperties({
                    rules: new Array(),
                    graphs: new Array(),
                    metrics: new Array(),
                });
            },


            _showMissingPlanMessage: function () {
                Mist.dialogController.open({
                    type: DIALOG_TYPES.OK,
                    head: 'No plan',
                    body: [
                        {
                            paragraph: 'In order to use our monitoring' +
                                ' service you have to purchase a plan'
                        },
                        {
                            paragraph: 'You can do that in the Account' +
                                ' page, which can be accessed from the' +
                                ' menu button on the top right corner, or' +
                                ' you can the link bellow:'
                        },
                        {
                            link: 'Account page',
                            href: 'https://mist.io/account'
                        }
                    ]
                });
            },


            _showManualMonitoringCommand: function () {

                var that = this;
                this.set('gettingCommand', true);
                Mist.monitoringController.getMonitoringCommand(
                    this.machine, function (success, data) {
                        if (success)
                            showPopup(data.command);
                        that.set('gettingCommand', false)
                });

                function showPopup (command) {
                    Mist.dialogController.open({
                        type: DIALOG_TYPES.OK_CANCEL,
                        head: 'Enable monitoring',
                        body: [
                            {
                                paragraph: 'Automatic installation of monitoring' +
                                    ' requires an SSH key'
                            },
                            {
                                paragraph: 'Run this command on your server for' +
                                    ' manual installation:'
                            },
                            {
                                command: command
                            },
                        ],
                        callback: function (didConfirm) {
                            if (didConfirm)
                                Mist.monitoringController.enableMonitoring(
                                    that.machine, null, true
                                );
                        },
                    });
                }
            },


            _showEnableMonitoringConfirmation: function () {
                var machine = this.machine;
                Mist.dialogController.open({
                    type: DIALOG_TYPES.YES_NO,
                    head: 'Enable monitoring',
                    body: [
                        {
                            paragraph: 'Are you sure you want to enable' +
                                ' monitoring for this machine?'
                        }
                    ],
                    callback: function (didConfirm) {
                        if (didConfirm)
                            Mist.monitoringController.enableMonitoring(machine);
                    }
                });
            },


            _showGraphs: function () {

                var cookie = Mist.cookiesController
                    .getSingleMachineEntry(this.machine);

                if (Mist.graphsController.isOpen)
                    return;
                this.set('graphs', this.graphs.sortBy('index'));
                this.set('pendingFirstStats', true);
                Mist.graphsController.open({
                    graphs: this.graphs,
                    config: {
                        canModify: true,
                        canControl: true,
                        canMinimize: true,
                        timeWindow: cookie.timeWindow,
                    }
                });

                Ember.run.next(function () {
                    $('#time-window-control select')
                        .val(cookie.timeWindow)
                        .trigger('change');
                });

                var that = this;
                Mist.graphsController.one('onFetchStats', function () {
                    that.set('pendingFirstStats', false);
                });
            },


            _hideGraphs: function () {
                if (!Mist.graphsController.isOpen)
                    return;
                Mist.graphsController.close();
            },


            _updateRules: function () {
                Mist.rulesController.content.forEach(function (rule) {
                    if (this.machine.equals(rule.machine))
                        if (!this.rules.findBy('id', rule.id))
                            this.rules.pushObject(rule);
                }, this);
            },


            _updateMetrics: function () {
                Mist.metricsController.builtInMetrics.forEach(function (metric) {
                    if (!this.metrics.findBy('id', metric.id))
                        this.metrics.pushObject(metric);
                }, this);
                Mist.metricsController.customMetrics.forEach(function (metric) {
                    if (metric.hasMachine(this.machine) &&
                        !this.metrics.findBy('id', metric.id)) {
                            this.metrics.pushObject(metric);
                    }
                }, this);
            },


            _updateGraphs: function () {
                var that = this;
                var ctlWasStreaming = Mist.graphsController.stream.isStreaming;
                var graphWasAdded = false;
                this.metrics.forEach(function (metric, index) {
                    var datasource = Datasource.create({
                        metric: metric,
                        machine: this.machine
                    });
                    var graphExists = false;
                    this.graphs.some(function (graph) {
                        if (graph.datasources.findBy('id', datasource.id))
                            return graphExists = true;
                    }, this);
                    if (!graphExists) {
                        graphWasAdded = true;
                        Mist.graphsController.stream.stop();
                        var newGraph = Graph.create({
                            title: metric.name,
                            index: index,
                            datasources: [datasource],
                        });
                        newGraph.set('isHidden', getGraphCookie(newGraph).hidden);
                        newGraph.set('index', getGraphCookie(newGraph).index);
                        this.graphs.pushObject(newGraph);
                    }
                }, this);
                if (ctlWasStreaming && graphWasAdded)
                    Mist.graphsController.stream.start();
                function getGraphCookie (graph) {
                    return Mist.cookiesController
                        .getSingleMachineGraphEntry(that.machine, graph);
                }
            },


            _ruleAdded: function (event) {
                if (this.machine.equals)
                    if (this.machine.equals(event.rule.machine))
                        this.rules.pushObject(event.rule);
            },


            _ruleDeleted: function (event) {
                if (this.machine.equals)
                    if (this.machine.equals(event.rule.machine))
                        this.rules.removeObject(event.rule);
            },


            _metricAdded: function (event) {
                if (this.machine.equals)
                    if (this.machine.equals(event.machine))
                        this.metrics.pushObject(event.metric);
            },


            _metricDeleted: function (event) {
                if (this.metrics.findBy('id', event.metric.id))
                    this.metrics.removeObject(event.metric);
            },


            //
            //
            //  Observers
            //
            //


            hasMonitoringObserver: function () {
                if (this.machine.hasMonitoring)
                    this.showMonitoring();
                else
                    this.hideMonitoring();
            }.observes('machine.hasMonitoring'),


            metricsObsever: function () {
                Ember.run.once(this, '_updateGraphs');
            }.observes('metrics.@each'),
        });

        function moveGraphToEnd(graphId) {

            var parent = $("#" + graphId).parent();
            var prev = parent.prev();
            var next = parent.next();

            // Move to end
            parent.detach().appendTo('#graphs');
            prev.detach().appendTo('#graphs');
            next.detach().appendTo('#graphs');
        };

        function moveGraphButtonToEnd(graphId) {

            var parent = $("#" + graphId + '-btn').parent();
            var prev = parent.prev();
            var next = parent.next();

            // Move to end
            parent.detach().insertBefore($('#add-metric-btn'));
            prev.detach().insertBefore($('#add-metric-btn'));
            next.detach().insertBefore($('#add-metric-btn'));
        };
    }
);
