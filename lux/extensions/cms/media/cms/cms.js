//
//  LUX CMS
//  ---------------------------------

//  This is a the fornt-end implementation of lux content management system
//  extension. It provides an easy and elegant way to add content to
//  pages. It includes:

//  * Inline editing
//  * drag & drop for content blocks within a page
//  * Extendibility using javascript alone

//  The layout starts with a Page which contains a given set of ``Grid``
//  components which are managed the ``GridView`` model.
//
//  Each ``Grid`` contains one or more ``Row`` components which can be added
//  interactively. A row has several templates with a predefined set of
//  ``Columns``.
define(['lux'], function (lux) {
    "use strict";

    var
    logger = lux.getLogger('cms'),
    //
    cms = lux.cms = {
        name: 'page',
        //
        _content_types: {},
        //
        _wrapper_types: {},
        //
        // retrieve a content type by name
        content_type: function (name) {
            return this._content_types[name];
        },
        //
        // retrieve a wrapper type by name
        wrapper_type: function (name) {
            return this._wrapper_types[name];
        },
        //
        // Return an array of Content types sorted by name
        content_types: function () {
            return this._sorted(this._content_types);
        },
        //
        // Return an array of Wrapper types sorted by name
        wrapper_types: function () {
            return this._sorted(this._wrapper_types);
        },
        //
        // Create a new Content model and add it to the available content
        // types.
        create_content_type: function (name, attrs, BaseContent) {
            var meta = attrs.meta;
            if (!BaseContent) {
                BaseContent = Content;
            }
            attrs.meta = attrs.meta || {};
            attrs.meta.name = name.toLowerCase();
            var ct = BaseContent.extend(attrs);
            this._content_types[ct._meta.name] = ct;
            return ct;
        },
        //
        // Create a new Html Wrapper model and add it to the available wrappers
        // types.
        create_wrapper: function (name, attrs, BaseWrapper) {
            if (!BaseWrapper) {
                BaseWrapper = Wrapper;
            }
            if (!attrs.title) {
                attrs.title = name;
            }
            attrs.name = name.toLowerCase();
            var NewWrapper = BaseWrapper.extend(attrs),
                wrapper = new NewWrapper();
            this._wrapper_types[wrapper.name] = wrapper;
            return wrapper;
        },
        //
        set_transport: function (backend) {
            this._backend = backend;
            _(this._content_types).forEach(function (ct) {
                ct._meta.set_transport(backend);
            });
        },
        //
        // Internal method used by `content_tyeps` and `wrapper_types`
        _sorted: function (iterable) {
            var sortable = [];
            _(iterable).forEach(function (ct) {
                if (ct._meta) {
                    ct = ct._meta;
                }
                sortable.push({value: ct.name, text: ct.title});
            });
            sortable.sort(function (a, b) {
                return a.text > b.text ? 1 : -1;
            });
            return sortable;
        }
    };


    var ROW_TEMPLATES = new lux.Ordered(),
        BLOCK_TEMPLATES = new lux.Ordered(),
        content_type = 'content_type',
        dbfields = 'dbfields',
        skin_color_element = function (state) {
            if (!state.id) return state.text; // optgroup
            return "<div class='colored " + state.id + "'>" + state.text + "</div>";
        };
    //
    // Content Model
    // ----------------

    // Base class for contents.
    // A new content class is created via the higher level utility function
    // ``cms.create_content_type``.
    // A content can be persistent (its data is stored in a database) or not.
    // A non-persistent content stores its data in the page layout,
    // while the persistent one has also its own database representation.
    // To mark a model persistent, add the ``persistent: true`` attribute to
    // the ``meta`` object in the class definition.
    var Content = cms.Content = lux.Model.extend({
        show_title: false,
        //
        meta: {
            name: 'content',
            //
            fields: [
                new lux.ChoiceField('content_type', {
                    required: true,
                    choices: function () {
                        return cms.content_types();
                    },
                    fieldset: content_type,
                    select2: {placeholder: 'Choose a content'}
                }),
                //
                new lux.ChoiceField('wrapper', {
                    choices: function () {
                        return cms.wrapper_types();
                    },
                    fieldset: content_type,
                    select2: {minimumResultsForSearch: -1}
                }),
                //
                new lux.ChoiceField('skin', {
                    choices: lux.SKIN_NAMES,
                    fieldset: content_type,
                    select2: {
                        placeholder: 'Choose a skin',
                        formatResult: skin_color_element,
                        formatSelection: skin_color_element,
                        minimumResultsForSearch: -1,
                        escapeMarkup: function(m) { return m; }
                    }
                }),
                //
                new lux.Field('id', {
                    type: 'hidden',
                    fieldset: dbfields
                }),
                //
                new lux.Field('title', {
                    required: true,
                    fieldset: dbfields
                }),
                //
                new lux.KeywordsField('keywords', {
                    fieldset: dbfields,
                    select2: {
                        tags: [],
                        initSelection : function (element, callback) {
                            var data = [];
                            _(element.val().split(",")).forEach(function (val) {
                                if (val) data.push({id: val, text: val});
                            });
                            callback(data);
                        }
                    }
                })
            ]
        },
        //
        // Override the ``getForm`` method
        getForm: function (options) {
            options || (options = {});
            options.model = this;
            var form = new lux.Form(options);
            form.addFields(_.filter(this._meta.fields, function (field) {
                return !field.fieldset;
            }));
            return form;
        },
        //
        // Render this Content into a `container`. Must be implemented
        // by subclasses
        render: function (container) {},
        //
        close: function () {
            if (this.container) {
                this.container.trigger('close-plugin-edit');
                delete this.container;
            }
        },
        //
        // Sync only if the content is persistent in the backend,
        // otherwise no need to do anything
        sync: function (store, options) {
            this.set(content_type, this._meta.name);
            if (this._meta.persistent) {
                return this._super(store, options);
            } else {
                if (options && options.success) {
                    options.success.call(this._meta, this.fields());
                }
            }
        },
        //
        // Serialize the content.
        //
        // Used by the PositionView when sychronosing with backend
        serialize: function() {
            if (this._meta.persistent) {
                var pk = this.pk();
                if (pk) {
                    return pk;
                }
            } else {
                this.set(content_type, this._meta.name);
                return this.fields();
            }
        }
    });
    //
    // Wrapper Model
    // ----------------

    // Base class for html wrappers
    var Wrapper = cms.Wrapper = lux.Class.extend({
        render: function (view) {
            view.content.render(view.elem);
        }
    });
    //
    // Page Model
    // ----------------

    // A container of ``Content`` models displaied on a grid.
    var Page = lux.Model.extend({
        meta: cms,
        //
        // Got new content update
        update_content: function (o) {
            var id = o.id,
                data = o.data;
            if (id && data) {
                var ContentType = this.content_type(data.content_type);
                if (ContentType) {
                    var meta = ContentType.prototype._meta;
                    return meta.update(id, data);
                }
            }
            logger.error('Could not understand content');
        }
    });

    //
    // Dialog for editing Content
    // ------------------------------------

    //
    // Pop up dialog for editing content within a block element.
    // ``self`` is a positionview object.
    var edit_content_dialog = function (options) {
        var dialog = new lux.Dialog(options.contentedit),
            page_limit = options.page_limit || 10,
            // The grid containing the form
            grid = $(document.createElement('div')).addClass('columns'),
            content_fields = $(document.createElement('div')).addClass(
                'content-fields column pull-left span8'),
            content_data = $(document.createElement('div')).addClass(
                'content-data column').css('padding-left', content_fields.width()+20),
            //
            fieldset_content = $(document.createElement('fieldset')).addClass(
                content_type).appendTo(content_fields),
            fieldset_dbfields= $(document.createElement('fieldset')).addClass(
                dbfields).appendTo(content_fields),
            fieldset_submit= $(document.createElement('fieldset')).addClass(
                'submit').appendTo(content_fields),
            //
            // Build the form container
            form = new lux.Form(),
            //
            // Create the select element for HTML wrappers
            wrapper_select,
            content_select,
            content_id,
            //
            block;
            //
        form.elem.append(content_fields).append(content_data).appendTo(grid);
        form.addFields(Content._meta.fields);
        form.addSubmit({
            text: 'Done',
            fieldset: fieldset_submit
        });
        form.render();
        // Detach data fields
        fieldset_dbfields.detach();
        //
        dialog.body()
            .append(grid)
            .addClass('edit-content')
            .bind('close-plugin-edit', function () {
                dialog.destroy();
            });
        //
        // Change skin event
        form.elem.find('[name="skin"]').change(function () {
            block.skin = this.value;
        });
        //
        content_id = fieldset_dbfields.find('[name="id"]');
        content_select = fieldset_content.find('[name="content_type"]');
        wrapper_select = fieldset_content.find('[name="wrapper"]').change(function () {
            block.wrapper = this.value;
        });
        //
        // AJAX Content Loading
        if (options.content_url) {
            fieldset_dbfields.find('[name="title"]').Select({
                placeholder: 'Search content',
                minimumInputLength: 2,
                id: function (data) {
                    return data.title;
                },
                initSelection: function (element, callback) {
                    var value = element.val();
                    callback({'title': value});
                },
                formatResult: function (data, c, query) {
                    if (!data.title) {
                        // This must be the first entry
                        data.title = query.term;
                    }
                    return '<p>' + data.title + '</p>';
                },
                formatSelection: function (object, container) {
                    if (object.id === -1) {
                        content_id.val('');
                    } else if (object.id) {
                        $.ajax({
                            url: options.content_url + '/' + object.id,
                            success: function (model_data) {
                                var data = model_data,
                                    Content = cms.content_type(data.content_type);
                                if (model_data.data) {
                                    data = model_data.data;
                                    delete model_data.data;
                                    _.extend(data, model_data);
                                }
                                block.content = new Content(data);
                                block.content.updateForm(form.elem);
                            }
                        });
                    }
                    return object.title;
                },
                ajax: {
                    url: options.content_url,
                    minimumInputLength: 3,
                    data: function (term, page) {
                        return {
                            q: term, // search term
                            per_page: page_limit,
                            field: ['id', 'title'],
                            content_type: block.content._meta.name,
                            apikey: options.api_key
                        };
                    },
                    results: function (data, page) {
                        // Insert the null element at the beginning so that we
                        // put the typed test as an option to create a new
                        // content
                        data.splice(0, 0, {title: '', id: -1});
                        return {
                            results: data,
                            more: _.size(data)-1 === page_limit
                        };
                    }
                }
            });
        }
        //
        form.ajax({
            // Aijack form submission.
            // Get the content being edited via the ``edit_content``
            // attribute in the dialog (check the ``PositionView.edit_content`
            // method)
            beforeSubmit: function (arr) {
                var content = block.content,
                    fields = lux.fields_from_array(arr),
                    wrapper = fields.wrapper;
                delete fields.wrapper;
                content.replace(fields);
                block.wrapper = wrapper;
                block.set(content);
                dialog.fadeOut();
                return false;
            }
        });
        //
        // Change content type in the view block
        content_select.change(function (e) {
            var name = this.value;
            // Try to get the content from the block content history
            block.content = block.content_history[name];
            if (!block.content) {
                var ContentType = cms.content_type(name);
                if (ContentType) {
                    block.content = new ContentType();
                }
            }
            if (block.content) {
                block.log(block + ' changed content type to ' + block.content);
                block.content_history[block.content._meta.name] = block.content;
                if (block.content._meta.persistent) {
                    fieldset_content.after(fieldset_dbfields);
                    block.content.updateForm(form.elem);
                } else {
                    fieldset_dbfields.detach();
                }
                // Get the form for content editing
                content_data.html('');
                var cform = block.content.getForm();
                content_data.append(cform.render().elem.children());
            } else if (name) {
                web.logger.error('Unknown content type ' + name);
            } else {
                fieldset_dbfields.detach();
                content_data.html('');
            }
            if (block.wrapper !== wrapper_select.val()) {
                wrapper_select.val(block.wrapper).trigger('change');
            }
        });
        //
        // Inject change content
        dialog.set_current_view = function (view) {
            block = view;
            if (block.content) {
                block.content_history[block.content._meta.name] = block.content;
                content_select.val(block.content._meta.name).trigger('change');
            } else {
                content_select.val('').trigger('change');
            }
        };
        //
        return dialog;
    };

    //
    var
    //
    views = cms.views = {},
    //
    templateWidth = 150,
    //
    selectRowTemplate = new lux.ChoiceField('rowtemplate', {
        choices: function () {
            var names = [];
            ROW_TEMPLATES.each(function (_, name) {
                names.push(name);
            });
            return names;
        },
        select2: {
            placeholder: 'Select a row layout',
            minimumResultsForSearch: -1
        }
    }),
    //
    selectBlockTemplate = new lux.ChoiceField('blocktemplate', {
        choices: function () {
            var names = [];
            BLOCK_TEMPLATES.each(function (_, name) {
                names.push(name);
            });
            return names;
        },
        select2: {
            placeholder: 'Select a block layout',
            minimumResultsForSearch: -1
        }
    }),
    //
    //  ContentView
    //  ------------------------

    //  Base ``view`` class for Lux CMS.
    //  The content view can be either in ``editing`` or ``read`` mode.
    //  When in editing mode the ``this.options.editing`` attribute is ``true``.

    BaseContentView = views.base = lux.View.extend({
        // The constructor takes an HTML or jQuery element, an ``options`` object
        // and a ``parent`` ContentView.
        initialise: function (options) {
            this.parentType = options.parent ? options.parent.type : null;
            delete options.parent;
            this.options = options;
            this.store = this.options.store;
            this.name = this.elem.data('context');
            this.elem.addClass('cms-' + this.type).data('cmsview', this);
        },
        //
        // render the view and build children
        render: function () {
            var self = this;
            this.elem.children().each(function () {
                self.createChild(this);
            });
            this.elem.fadeTo('fast', 1);
        },
        // Setup the view for editing mode. Called during construction.
        setupEdit: function () {
            var self = this;
            if (this.childType && !this.editing) {
                _(this.childrenElem()).forEach(function(elem) {
                    var child = $(elem).data('cmsview');
                    if (child) {
                        child.setupEdit();
                    } else {
                        self.log('could not find editing element', 'WARNING');
                    }
                });
            }
            this.editing = true;
        },
        //
        // The parent view of this view.
        parent: function () {
            if (this.parentType) {
                return this.container().closest('.cms-'+this.parentType).data('cmsview');
            }
        },
        //
        // Fetch the child view at ``index``.
        child: function (index) {
            var child;
            this.iter(function (c, idx) {
                if (idx === index) {
                    child = c;
                    return lux.breaker;
                }
            });
            return child;
        },
        //
        // jQuery element containing all children
        childrenElem: function () {
            if (this.childType) {
                return this.elem.find('.cms-' + this.childType);
            } else {
                return [];
            }
        },
        //
        // Iterate over children views
        iter: function (callback) {
            _(this.childrenElem()).forEach(function (child, index) {
                callback($(child).data('cmsview'), index);
            });
        },
        //
        page: function () {
            return this.parent().page();
        },
        //
        grid: function () {
            return this.parent().grid();
        },
        //
        current_column: function () {
            return this.page().current_column();
        },
        //
        // position within its parent
        index: function () {
            var parent = this.parent(),
                index = -1,
                elem = this.elem[0];
            if (parent) {
                _(parent.childrenElem()).forEach(function (c, idx) {
                    if (elem === c) {
                        index = idx;
                        return lux.breaker;
                    }
                });
            }
            return index;
        },
        //
        // Create child element and append it to this view
        createChild: function (elem, content) {
            if (this.childType) {
                var View = views[this.childType],
                    options = this.options;
                if (!View) {
                    throw new lux.NotImplementedError(this + ' has no createChild method.');
                }
                options.elem = elem;
                options.parent = this;
                var child = new View(options);
                if (content === Object(content)) {
                    child.elem.data(content);
                }
                child.render(this);
                return child;
            }
        },
        //
        // The jQuery element containing this view.
        //
        // It can be different form the view jQuery ``elem``.
        container: function () {
            return this.dialog ? this.dialog.elem : this.elem;
        },
        //
        // Retrieve a column from the child at ``index``. If index is not provided
        // or is out of bounds, retrieve the column from the first child
        get_column: function (index) {
            var child = this.childrenElem().first(),
                view = child.data('cmsview');
            return view.get_column();
        },
        //
        // Layout information for this view.
        //
        // This method is invoked when a view needs to sync with the backend
        // database. By default a view returns an array containing the layout
        // information of its children.
        layout: function () {
            var all = [],
                layout;
            this.iter(function (child) {
                layout = child.layout();
                if (layout) all.push(layout);
            });
            return all.length ? all : null;
        },
        //
        // Create dialog
        _create_edit_dialog: function (opts) {
            if (!this.dialog) {
                this.dialog = new lux.Dialog(opts);
                this.elem.before(this.dialog.elem);
                this.dialog.body().append(this.elem);
            }
            return this.dialog;
        },
        //
        log: function (msg, lvl) {
            var page = this.page();
            if (page && page.logger) {
                if (lvl) {
                    page.logger.html('<p class="text-danger">' + lvl + ': ' + msg + '</p>');
                } else {
                    page.logger.html('<p>' + msg + '</p>');
                }
            }
        },
        //
        toString: function () {
            var n = this.index();
            return n === -1 ? this.type : this.type + '-' + n;
        }
    }),

    //  PageView
    //  --------------

    //  Handle the CMS page.
    //  This is the view which contains children ``GridView``.
    //  GridView are created for all descendant which match the
    //  ``.cms-grid`` selector.
    //  A page does not add any child during editing, it is just a container
    //  of grid elements.
    PageView = views.page = BaseContentView.extend({
        type: 'page',
        //
        childType: 'grid',
        //
        // Setup the view and build children which match cms
        render: function () {
            var self = this;
            this.childrenElem().each(function () {
                self.createChild(this);
            });
            // setup editing first
            if (this.options.editing) {
                self.model = new Page({id: this.options.editing});
                this.setupEdit();
            }
            this.elem.fadeTo(100, 1);
        },
        //
        // Setup editing view
        setupEdit: function () {
            if (!this.editing) {
                var control = $('.cms-control'),
                    grid = new lux.Grid({rows: [[8,8,8]]});
                this.logger = $('<div class="cms-info"></div>');
                if (!control.length) {
                    control = $(document.createElement('div'))
                        .addClass('cms-control');
                }
                grid.row(0).column(0).append(control);
                this.elem.prepend(grid.elem);
                this.control = new lux.Dialog(_.extend({
                    elem: grid.elem}, this.options.page));
                this.control.header().prepend(this.logger);
                control.show();
                this._add_block_control();
                //
                // Create Drag & drop elements for the dialogs
                if (this.options.block.dragdrop) {
                    this.options.block.dragdrop = this._create_drag_drop(this.options.block);
                }
                if (this.options.row.dragdrop) {
                    this.options.row.dragdrop = this._create_drag_drop(this.options.row);
                }
                this._super();
            }
        },
        //
        page: function () {
            return this;
        },
        //
        grid: function () {
            return null;
        },
        //
        index: function () {
            return -1;
        },
        // Return the current ``ColumnView`` element.
        get_current_column: function () {
            return this._current_column;
        },
        set_current_column: function (column) {
            if (this._current_column) {
                this._current_column.elem.removeClass('active');
            }
            this._current_column = column;
            if (column) {
                this.log('Selected current ' + column);
                column.elem.addClass('active');
            }
        },
        //
        // Returns an object rather than a list of children layouts
        layout: function () {
            var all = {},
                layout;
            this.iter(function (child) {
                layout = child.layout();
                if (layout) all[child.name] = layout;
            });
            return all;
        },
        //
        // Synchronise this view with the backend
        sync: function () {
            var self = this;
            this.model.set('content', this.layout());
            this.log('saving layout...');
            self.model.sync(self.store, {
                success: function () {
                    self.log('Layout saved');
                }
            });
        },
        //
        // Create the "Add Block" button for adding a block into a column.
        _add_block_control: function () {
            var self = this,
                options = self.options,
                control = this.control,
                button = control.createButton({
                    icon: options.add_block_icon,
                    title: 'Add new block'
                }),
                select = selectBlockTemplate.render(function (elem) {
                    self.control.buttons.prepend(elem);
                }).width(templateWidth);
            self.control.buttons.prepend(button.elem);
            button.elem.click(function () {
                var templateName = select.val(),
                    column = self.get_current_column();
                //
                // Add the block to the current column
                if (!column || column.index() < 0) {
                    column = self.get_column();
                    self.set_current_column(column);
                }
                if (column) {
                    column.add_block(templateName);
                } else {
                    self.log('WARNING: No column available!');
                }
            });
        },
        //
        // Enable drag and drop
        _create_drag_drop: function (opts) {
            var self = this,
                dd = new lux.DragDrop({
                    dropzone: '.' + opts.dropzone,
                    placeholder: $(document.createElement('div')).addClass(opts.dropzone),
                    onDrop: function (elem, e) {
                        dd.moveElement(elem, this);
                        self.sync();
                    }
                });
            dd.add('.' + opts.dropzone, '.' + opts.dropzone + ' > .header');
            return dd;
        }
    }),

    //
    //  Grid View
    //  --------------------
    //
    //  View manager for a Grid. A grid is a container of Rows.
    //  In editing mode it is used to add and remove Rows.
    GridView = views.grid = BaseContentView.extend({
        type: 'grid',
        //
        childType: 'row',
        //
        setupEdit: function () {
            if (!this.editing) {
                var self = this,
                    dialog = this._create_edit_dialog(this.options.grid),
                    add_row = dialog.createButton({
                        icon: this.options.add_row_icon,
                        title: 'Add new row'
                    }),
                    select = selectRowTemplate.render(function (elem) {
                        dialog.buttons.prepend(elem);
                    }).width(templateWidth);
                //
                dialog.elem.css('margin-top', '5px');
                dialog.title(this.name);
                dialog.buttons.prepend(add_row.elem);
                // Adds a bright new row
                add_row.elem.click(function () {
                    var row = self.createChild(null, {template: select.val()});
                    self.elem.append(row.container());
                    row.setupEdit();
                });
                this._super();
            }
        },
        //
        grid: function () {
            return this;
        },
        //
        index: function () {
            return this.name;
        },
        //
        toString: function () {
            return this.type + '-' + this.name;
        }
    }),

    //  Row View
    //  -------------------
    //
    //  Rows are created with a prefixed number of Columns.
    //  They are rendered by the template chosen when the Row is created.
    //  Therefore no columns are added nor deleted once a Row is created.
    //
    //   * The number of children is fixed by the ``template`` attribute.
    //   * The ``template`` is retrieved from the ``data-template``.
    RowView = views.row = BaseContentView.extend({
        type: 'row',
        //
        childType: 'column',
        //
        templates: ROW_TEMPLATES,
        //
        render: function () {
            if (this.type == 'row') {
                this.elem.addClass('row grid' + this.options.columns);
            }
            this.templateName = this.elem.data('template');
            this.template = this.templateName ? this.templates.get(this.templateName) : null;
            if (!this.template) {
                this.templateName = this.templates.order[0];
                this.template = this.templates.get(this.templateName);
            }
            var self = this,
                num = this.template.length,
                index = 0;

            this.elem.children().detach().each(function () {
                if (index < num) {
                    self.template.append(self.createChild(this), self, index);
                    index += 1;
                }
            });
            // Need more children for the template
            for (; index<num; index++) {
                self.template.append(self.createChild(), self, index);
            }

        },
        //
        setupEdit: function () {
            this._create_edit_dialog(this.options[this.type]);
            this._super();
        },
        //
        // Serialise the layout of a row
        //
        // * Keep the location of columns in a row.
        // * If no columns have data skip the row
        layout: function () {
            var all = [],
                avail = false;
            _(this.childrenElem()).forEach(function (child) {
                child = $(child).data('cmsview');
                var layout = child.layout();
                all.push(layout);
                if (layout) avail = true;
            });
            if (avail) {
                return {
                    template: this.templateName,
                    children: all
                };
            }
        },
        //
        _create_edit_dialog: function (opts) {
            if (!this.dialog) {
                var dialog = this._super(opts),
                    page = this.page();
                dialog.elem.addClass(opts.dropzone).bind('removed', function () {
                    if (page) {
                        page.sync();
                    }
                });
            }
            return this.dialog;
        },
    }),

    //  Column View
    //  -------------------
    //
    //  Handle the A Column within a Row.
    //  A column is a container of several Blocks vertically aligned.
    ColumnView = views.column = BaseContentView.extend({
        type: 'column',
        //
        childType: 'block',
        //
        setupEdit: function () {
            if (!this.editing) {
                var self = this;
                this.elem.click(function () {
                    self.page().set_current_column(self);
                });
                this._super();
            }
        },
        //
        // Return self
        get_column: function () {
            return this;
        },
        //
        // Add a new block to the column
        add_block: function (templateName) {
            var child = this.createChild(null, {template: templateName});
            this.elem.append(child.container());
            this.log('Added new ' + child);
            if (this.editing) {
                child.setupEdit();
            }
        }
    });

    //  Block View
    //  -------------------
    //
    //  The Block View inherits from the ``RowView``.
    //  Blocks are displaied within a ColumnView in
    //  a vertical layout.
    var BlockView = views.block = RowView.extend({
        type: 'block',
        //
        childType: 'content',
        //
        templates: BLOCK_TEMPLATES,
        //
        get_column: function () {
            return this.parent();
        }
    }),

    //  Content View
    //  --------------------
    //
    //  The container of contents and therefore the atom of lux CMS.
    //  The content can be either retrieved via a backend (when in editing mode)
    //  Or accessed via children elements when in read mode. Childern elements
    //  have the ``field`` entry in their html data attribute. The field contains
    //  the name of the field for which the inner html of the element provides value.
    ContentView = views.content = BaseContentView.extend({
        type: 'content',
        //
        render: function () {
            var self = this,
                data = this.elem.data(),
                Content = lux.cms.content_type(data.content_type),
                content;
            if (Content) {
                // remove the content_type & cmsview
                this.wrapper = data.wrapper;
                this.skin = data.skin;
                data = _.merge({}, data);
                delete data.wrapper;
                delete data.skin;
                delete data.cmsview;
                this.elem.children().each(function () {
                    var elem = $(this),
                        field = elem.data('field');
                    if (field) {
                        data[field] = elem.html();
                    } else {
                        self.log('Field not available in content', 'WARNING');
                        //TODO: what is this?
                        //this.content_type.fields.jQuery = elem;
                    }
                });
                if (!data.keywords) data.keywords = [];
                this.set(new Content(data), false);
            }
        },
        //
        // Setup the editing view by adding the edit button which trigger the
        // ``edit_content`` method when clicked.
        setupEdit: function () {
            if (!this.editing) {
                var self = this,
                    container = $(document.createElement('div')),
                    toolbar = $(document.createElement('div'))
                                .addClass('cms-content-toolbar').appendTo(container),
                    group = $(document.createElement('div'))
                                .addClass('btn-group pull-right').appendTo(toolbar),
                    parent = this.parent(),
                    button = parent.dialog.createButton({icon: 'edit', size: 'mini'});
                button.elem.click(function () {
                    self.edit_content();
                }).appendTo(group);
                this.button_group = group;
                this.title = $(document.createElement('span')).prependTo(toolbar);
                container.appendTo(this.elem.parent());
                this.elem.addClass('preview').appendTo(container);
                this._container = container;
                this.content_history = {};
                this.editing = true;
                if (this.content) {
                    this.title.html(this.content._meta.title);
                }
            }
        },
        //
        container: function () {
            return this._container ? this._container : this.elem;
        },
        //
        child: function (index) {
            return null;
        },
        //
        // Retrieve content from backend when in editing mode, otherwise
        // set the fields obtained from subelements in the ``createChild`` method.
        get_content: function (ct) {
            var ContentType = lux.cms.content_type(ct.content_type),
                self = this;
            if (ContentType) {
                var fields = this.elem.data('fields');
                if (ct.fields || fields === 0) {
                    fields = ct.fields;
                    if (ct.id) {
                        fields = fields || {};
                        fields.id = ct.id;
                    }
                    this.set(new ContentType(fields), false);
                // If id given, needs to load the content
                } else if (ct.id) {
                    ContentType._meta.get(ct.id, {
                        success: function (data) {
                            self.set(data[0], false);
                        }
                    });
                } else {
                   self.log('could not understand content!', 'WARNING');
                }
            }
        },
        //
        layout: function () {
            if (this.content) {
                return {
                    content: this.content.serialize(),
                    skin: this.skin,
                    wrapper: this.wrapper
                };
            }
        },
        //
        // Set the ``content`` for this Content View.
        // When ``sync`` is not ``false``
        // the content is synchronised with the backend (editing mode).
        set: function (content, sync) {
            this.content = content;
            var wrapper = cms.wrapper_type(this.wrapper);
            this.elem.html('');
            if (wrapper) {
                wrapper.render(this);
            } else {
                content.render(this.elem, this.skin);
            }
            // Set the toolbar title if in editing mode
            if (this.title) {
                this.title.html(content._meta.title);
            }
            if (sync !== false) {
                var self = this,
                    page = this.page();
                // save the content if it needs to be saved
                content.sync(self.store, {
                    success: function () {
                        self.log(self + ' set content to ' + self.content);
                        page.sync();
                    },
                    error: function (status) {
                        self.log('ERROR while synching. ' + status);
                    }
                });
            }
        },
        //
        get_column: function () {
            return this.parent.get_column();
        },
        //
        // Edit content by opening a dialog.
        edit_content: function () {
            var root = this.page(),
                dialog = root._content_dialog;
            if (!dialog) {
                dialog = edit_content_dialog(root.options);
                root._content_dialog = dialog;
            }
            dialog.set_current_view(this);
            dialog.fadeIn();
            return dialog;
        }
    });

    //
    //  CMS Layouts
    //  -------------------------
    //
    //  The ``Layout`` is the base class from Block Layouts. Each layouts has
    //  the ``length`` attribute which defines the number of elements
    //  within the layout.
    var Layout = lux.Class.extend({
        //
        init: function (length) {
            this.length = length;
        },
        //
        append: function (pos, block, index) {
            var elem = pos.container();
            if (this.length === 1) {
                block.elem.append(elem);
            } else {
                var inner = block.inner;
                if (!block.elem.children().length) {
                    block.elem.addClass('row grid'+block.options.columns);
                }
                elem.addClass('span' + block.options.columns/this.length).appendTo(block.elem);
            }
        }
    });

    var Tabs = Layout.extend({
        append: function (pos, block, index) {
            var elem = pos.container();
            if (this.length === 1) {
                block.elem.append(elem);
            } else {
                var inner = block.inner,
                    href = lux.s4(),
                    title = pos.elem.attr('title'),
                    a = $(document.createElement('a')).attr('href', '#'+href).html(title);
                if (!inner) {
                    block.ul = $(document.createElement('ul')).appendTo(block.elem);
                    block.inner = inner = $(document.createElement('div')).appendTo(block.elem);
                }
                block.ul.append($(document.createElement('li')).append(a));
                block.inner.append($(document.createElement('div')).attr('id', href).append(elem));
            }
        }
    });

    var RowTemplate = lux.Class.extend({
        //
        init: function (splits) {
            this.splits = splits;
            this.length = splits.length;
        },
        //
        append: function (child, parent, index) {
            var elem = child.container();
            elem.addClass('column span' + this.splits[index]*parent.options.columns);
            parent.elem.append(elem);
        }
    });


    ROW_TEMPLATES.set('One Column', new RowTemplate([1]));
    ROW_TEMPLATES.set('Half-Half', new RowTemplate([1/2, 1/2]));
    ROW_TEMPLATES.set('33-66', new RowTemplate([1/3, 2/3]));
    ROW_TEMPLATES.set('66-33', new RowTemplate([2/3, 1/3]));
    ROW_TEMPLATES.set('25-75', new RowTemplate([1/4, 3/4]));
    ROW_TEMPLATES.set('75-25', new RowTemplate([3/4, 1/4]));

    ROW_TEMPLATES.set('33-33-33', new RowTemplate([1/3, 1/3, 1/3]));
    ROW_TEMPLATES.set('50-25-25', new RowTemplate([1/2, 1/4, 1/4]));
    ROW_TEMPLATES.set('25-25-50', new RowTemplate([1/4, 1/4, 1/2]));
    ROW_TEMPLATES.set('25-50-25', new RowTemplate([1/4, 1/2, 1/4]));

    ROW_TEMPLATES.set('25-25-25-25', new RowTemplate([1/4, 1/4, 1/4, 1/4]));


    BLOCK_TEMPLATES.set('1 element', new Layout(1));
    BLOCK_TEMPLATES.set('2 elements', new Layout(2));
    BLOCK_TEMPLATES.set('3 elements', new Layout(3));
    BLOCK_TEMPLATES.set('2 tabs', new Tabs(2));
    BLOCK_TEMPLATES.set('3 tabs', new Tabs(3));
    BLOCK_TEMPLATES.set('4 tabs', new Tabs(4));

    //
    //  Default CMS Wrappers
    //  --------------------------------

    var _panel = function (view, with_header, with_title) {
        var outer = $("<div class='panel panel-default'></div>").appendTo(view.elem).addClass(view.skin);
        if (with_header) {
            var head = $("<div class='header'></div>").appendTo(outer),
                title = view.content.get('title');
            if (with_title) {
                head = $("<h3 class='title'></h3>").appendTo(head);
            }
            if (title) {
                head.html(title);
            }
        }
        var elem = $("<div class='body'></div>").appendTo(outer);
        view.content.render(elem, view.skin);
    };


    cms.create_wrapper('nothing', {
        title: 'No Wrapper'
    });

    cms.create_wrapper('well', {
        title: 'Well',
        render: function (view) {
            var elem = $("<div class='well'></div>").appendTo(view.elem);
            view.content.render(elem);
        }
    });

    cms.create_wrapper('welllg', {
        title: 'Well Large',
        render: function (view) {
            var elem = $("<div class='well well-lg'></div>").appendTo(view.elem).addClass(view.skin);
            view.content.render(elem);
        }
    });

    cms.create_wrapper('wellsm', {
        title: 'Well Small',
        render: function (view) {
            var elem = $("<div class='well well-sm'></div>").appendTo(view.elem).addClass(view.skin);
            view.content.render(elem);
        }
    });

    cms.create_wrapper('panel', {
        title: 'Panel',
        render: function (view) {
            _panel(view);
        }
    });

    cms.create_wrapper('panelheading', {
        title: 'Panel with heading',
        render: function (view) {
            _panel(view, true);
        }
    });

    cms.create_wrapper('paneltitle', {
        title: 'Panel with title',
        render: function (view) {
            _panel(view, true, true);
        }
    });

    //
    //  Default CMS Contents
    //  --------------------------------
    //
    //  The following are the default CMS contents shipped with lux ``cms``
    //  distribution. The are created by invoking the
    //  ''lux.cms.create_content_type`` function.

    //
    //  This Content
    //  -------------------
    //
    //  The first a probably most important content type. It represents
    //  the response obtained by the backend server without the cms
    //  system in place.
    cms.create_content_type('contenturl', {
        meta: {
            title: 'Site Content',
            fields: [
                new lux.ChoiceField('content_url', {
                    label: 'Choose a content',
                    choices: function () {
                        var vals = [];
                        _(lux.content_urls).forEach(function (value) {
                            vals.push(value);
                        });
                        return vals;
                    }
                })
            ]
        },
        //
        render: function (container, skin) {
            var url = this.get('content_url');
            if (url === 'this') {
                // defer to later
                var html = this.get('this');
                _.defer(function () {
                    lux.loadViews(container.html(html));
                });
            } else if (url) {
                container.html('&nbsp;');
                $.ajax(url, {
                    dataType: 'json',
                    success: function (data, status, xhr) {
                        if (data.html) {
                            require(data.requires || [], function () {
                                lux.loadViews(container.html(data.html));
                            });
                        }
                    }
                });
            } else {
                logger.warning('Missing underlying page url and html');
            }
        }
    });
    //
    //  Blank Content
    //  -------------------
    //
    //  Insert a non-breaking space.
    cms.create_content_type('blank', {
        model_title: 'The content served by the url',
        render: function (container) {
            container.html('&nbsp;');
        }
    });
    //
    //  Markdown
    //  -------------------
    //
    //  Insert a non-breaking space.
    cms.create_content_type('markdown', {
        //
        meta: {
            title: 'Text using markdown',
            persistent: true,
            fields: [
                new lux.TextArea('raw', {
                    rows: 10,
                    placeholder: 'Write markdown'
                }),
                new lux.TextArea('javascript', {
                    rows: 7,
                    placeholder: 'javascript'
                })
            ]
        },
        //
        render: function (container) {
            var self = this;
            require(['showdown'], function () {
                var raw = self.get('raw') || '',
                    js = self.get('javascript') || '',
                    converter = new Showdown.converter(),
                    html = converter.makeHtml(raw);
                lux.loadViews(container.html(html));
                if (js) {
                    var b = $('body'),
                        script = $("<script type='application/javascript'>" + js + "</script>"),
                        cid = self.cid();
                    $('#' + cid, b).remove();
                    b.append(script.attr('id', cid));
                }
            });
        },
        //
        get_form_new: function (callback) {
            var f = this._meta.fields,
                form = lux.web.form(),
                raw = f.raw.add_to_form(form, this),
                js = f.javascript.add_to_form(form, this),
                tabs = new lux.TabView({tabs: [
                    {
                        name: 'markdown',
                        content: raw
                    },
                    {
                        name: 'javascript',
                        content: js
                    }]
                });
            form._element.empty().append(tabs.elem);
            require(['codemirror'], function () {
                CodeMirror.fromTextArea(raw[0]);
                CodeMirror.fromTextArea(js[0]);
                callback(form);
            });
        }
    });
    //
    //  Versions
    //  -------------------
    cms.create_content_type('versions', {
        meta: {
            title: 'Versions of libraries'
        },
        //
        render: function (container) {
            var ul = $(document.createElement('ul')).appendTo(container);
            _(lux.libraries).forEach(function (lib) {
                ul.append($('<li><a href="' + lib.web + '">' + lib.name +
                            '</a> ' + lib.version + '</li>'));
            });
        }
    });
    //
    //  Datatable
    //  --------------------

    // Data table for models allows to build highly configurable tables or grids
    // which represents collections of models.
    //
    // THis content is available only when lux provide an api for models in the
    // html tag via the ``api`` data key.
    cms.create_content_type('datatable', {
        //
        meta: {
            title: 'Data Grid',
            //
            persistent: true,
            //
            render_queue: [],
            //
            api_info: function (api) {
                this.api = api || {};
                var queue = this.render_queue;
                delete this.render_queue;
                _.each(queue, function (o) {
                    o.content._render(o.container, o.skin);
                });
            },
            //
            fields: [
                new lux.ChoiceField('url', {
                    label: 'Choose a model',
                    choices: function (form) {
                        var api = form.model.api();
                        return api.groups;
                    },
                    select2: {}
                }),
                new lux.MultiField('fields', {
                    placeholder: 'Select fields to display',
                    select2: {}
                }),
                new lux.MultiField('row_actions', {
                    label: 'Row actions',
                    placeholder: 'Action on rows',
                    choices: [{value: 'delete'}],
                    select2: {
                        minimumResultsForSearch: -1
                    }
                }),
                new lux.ChoiceField('style', {
                    tag: 'input',
                    choices: ['table', 'grid']
                }),
                new lux.BooleanField('sortable'),
                new lux.BooleanField('editable'),
                new lux.BooleanField('collapsable'),
                new lux.BooleanField('fullscreen'),
                new lux.BooleanField('footer', {
                    label: 'Display Footer'
                })
            ]
        },
        //
        render: function (container, skin) {
            var self = this;
            require(['datagrid'], function () {
                if (self._meta.api === undefined) {
                    self._meta.render_queue.push({
                        content: self,
                        'container': container,
                        'skin': skin
                    });
                } else {
                    self._render(container, skin);
                }
            });
        },
        //
        getForm: function () {
            var form = this._super();
            this._formActions(form);
            return form;
        },
        //
        // Internal methods

        //
        // Actually does the datagrid rendering
        _render: function (container, skin) {
            var elem = $(document.createElement('div')).appendTo(container),
                options = _.extend({}, this.fields()),
                models = this.api().models,
                model = models ? models[options.url] : null,
                headers = [];
            if (model) {
                if (options.fields) {
                    var available_fields = {};
                    _(model.fields).forEach(function (elem) {
                        available_fields[elem.code] = elem;
                    });
                    _(options.fields).forEach(function (code) {
                        var head = available_fields[code];
                        if (head) {
                            headers.push(head);
                        }
                    });
                }
                if (headers.length) {
                    options.columns = headers;
                } else {
                    options.columns = model.fields;
                }
                options.store = options.url;
                options.skin = skin;
                elem.datagrid(options);
            }
        },
        //
        api: function () {
            var api = this._meta.api;
            if (api) {
                if (!api.groups && api.sitemap) {
                    this._create_groups(api);
                }
                return api;
            } else {
                return {};
            }
        },
        //
        // sitemap is a list of api section handlers
        _create_groups: function (api) {
            var groups = [],
                models = {};
            //
            // Add options to the model select widgets
            _(api.sitemap).forEach(function (section) {
                var group = $(document.createElement('optgroup')).attr(
                    'label', section.name);
                groups.push(group);
                _(section.routes).forEach(function (route) {
                    $(document.createElement('option'))
                        .val(route.api_url).html(route.model).appendTo(group);
                    // Add the route to the models object
                    models[route.api_url] = route;
                });
            });
            api.groups = groups;
            api.models = models;
        },
        //
        // Add action to the datagrid form
        _formActions: function (form) {
            var self = this,
                api = this.api(),
                models = api.models,
                fields_select = form.elem.find('[name="fields"]');
            //
            // When a model change, change the selction as well.
            form.elem.find('[name="url"]').change(function (e) {
                var url = $(this).val(),
                    model = models[url];
                // there is a model
                fields_select.val([]).trigger("change");
                fields_select.children().remove();
                if (model) {
                    //
                    // Add options
                    if (model.options) {
                        _(model.options).forEach(function (option) {
                            fields_select.append(option);
                        });
                    } else {
                        model.options = [];
                        model.map = {};
                        _(models[url].fields).forEach(function (field) {
                            var option = $(document.createElement('option'))
                                            .val(field.code).html(field.name);
                            model.map[field.code] = field;
                            model.options.push(option);
                            fields_select.append(option);
                        });
                    }
                    //
                    // The model correspoend with the current content model
                    // selct fields accordignly
                    if (url === self.get('url')) {
                        _(self.get('fields')).forEach(function (field) {

                        });
                    }
                }
            }).val(this.get('url')).trigger('change');
        },
    });

    //
    //  lux web CMS extension
    //  --------------------------------
    //
    //  This is the javascript handler of ``lux.extensions.cms``.
    //  Updates to the backend are either via a websocket or ajax requests.
    var CmsView = lux.CmsView = lux.createView('cms', {
        //
        selector: '.cms-page',
        //
        defaults: {
            //
            editing: false,
            // backend url used to communicate with backend server
            // when updating & creating content as well as when
            // repositioning it
            backend_url: null,
            //
            // content url is used for AJAX retrieval of database contents
            content_url: null,
            //
            // icon for the button which add a new row in a grid
            add_row_icon: 'columns',
            // icon for the button which add a new block in a column
            add_block_icon: 'plus',
            //
            skin: 'control',
            //
            row_control_class: 'add-row',
            //
            columns: 24,
            //
            // Hart beat for websocket connections
            hartbeat: 5,
            //
            // Options for the dialog controlling page inputs
            page: {
                collapsable: true,
                collapsed: true,
                className: 'control',
                skin: 'inverse',
                buttons: {
                    size: 'default'
                }
            },
            // Options for the dialog controlling one grid
            grid: {
                collapsable: true,
                className: 'control',
                buttons: {
                    size: 'default'
                }
            },
            // Options for the row dialog
            row: {
                closable: true,
                collapsable: true,
                skin: 'default',
                size: 'mini',
                dragdrop: false,
                dropzone: 'row-control'
            },
            // Options for the block dialog
            block: {
                closable: true,
                collapsable: true,
                skin: 'primary',
                size: 'mini',
                dragdrop: true,
                dropzone: 'block-control'
            },
            // Options for content editing dialog
            contentedit: {
                modal: true,
                movable: true,
                fullscreen: true,
                autoOpen: false,
                width: 600,
                title: 'Edit Content',
                fade: {duration: 20},
                closable: {destroy: false}
            }
        },
        //
        // The decorator called by ``lux.web``
        initialise: function (options) {
            var self = this,
                elem = self._element;
            // In editing mode, set-up grids
            if (options.editing) {
                //self._handle_close();
                this.elem.addClass('editing');
                //
                options.store = new lux.create_store(
                    options.backend_url, {
                        hartbeat: options.hartbeat
                    });
                //if (options.store.type === 'websocket') {
                //   this.backend = web.backend({store: options.store});
                //}
            }
            this._setup_api();
            this._super(options);
        },
        //
        _setup_api: function () {
            var api = $('html').data('api');
            if (!api) {
                this.on_sitemap();
            } else {
                var self = this;
                $.ajax(api.url, {
                    dataType: 'json',
                    success: function (data, status, xhr) {
                        self.on_sitemap(api, data);
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        self.on_sitemap(api);
                    }
                });
            }
        },
        //
        // When the api sitemap is available, this method setup the
        // datatable content type.
        on_sitemap: function (api, sitemap) {
            var datatable = cms.content_type('datatable');
            if (datatable) {
                if (api) {
                    api.sitemap = sitemap;
                }
                datatable._meta.api_info(api);
            }
        },
        //
        _handle_close: function () {
            $(window).bind('beforeunload', function (e) {
                e.preventDefault();
                return false;
            });
        }
    }, PageView);

	//
	return cms;
});