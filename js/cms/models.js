
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
