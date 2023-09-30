
//Resolve references to the schema namespace
import * as schema from "../../../schema/v_metavisuo/code/schema.js";
import * as outlook from "../../../outlook/v/code/outlook.js";
//
//THis library helps us to talk to the server in PHP
import * as server from "../../../schema/v_metavisuo/code/server.js"

import * as quest from "../../../schema/v_metavisuo/code/questionnaire.js";
// 
// Define the namespace needed to create svg elements
const svgns = "http://www.w3.org/2000/svg";

//Display the metavisuo chart
export class metavisuo extends outlook.page {
    //
    public current_db?: database;
    // 
    //class constructor.
    constructor() {
        super();
    }

    //
    //Generate the structure from the selected database among the list of all 
    //available databases and draw its visual structure
    async get_metadb(dbname: string): Promise<database> {
        //
        //Generate an Idatabase structure for the selected database
        const structure: schema.Idatabase = await server.exec("database", [dbname], "export_structure", []);
        //
        //Use the generated schema.Idatabase to generate a database structure
        const dbase = new schema.database(structure);
        //
        //Get the element where to hook the svg element
        const content = this.get_element('content');
        //
        //Create the database structure to visualize
        return new database(content, this, dbase);
    }
    //
    //Populate the selector designated to hold all the named databases on 
    //this server and return the selector
    populate_selector(databases: Array<string>): HTMLSelectElement {
        //
        //Get the selector element
        const selector = <HTMLSelectElement> this.get_element("databases");
        //
        //For each database name create a selector option and add it to the selector
        databases.forEach(dbname => this.create_element("option", selector, {
            textContent: dbname,
            value: dbname
        }));
        //
        //Rteurn teh selector
        return selector;
    }
    //
    //Fetch all databases saved within the MYSQL database structure
    async get_databases(): Promise<Array<string>> {
        //
        //Construct the query to extract all databases except mysql, performance_schema,phpmyadmin
        //sys, and information schema
        const sql:string = 
            `select 
                schema_name as dbname 
             from 
                information_schema.schemata
             where
                schema_name not in (
                    'mysql','performance_schema', 'sys','information_schema','phpmyadmin'
                )
            `
        //
        //Construct and execute the query to list all databases using the 
        //information schema
        const dbases: Array<{dbname: string}> = await server.exec("database", ["information_schema"], "get_sql_data", [sql]);
        //
        //Return the compiled list of database names
        return dbases.map(db=>db.dbname);
    }
    // 
    //
    //Get all databases in the system, populate the selector and pick
    //the first database
    public async show_panels(): Promise<void> {
        //
        //Get all the databases saved within the system
        const databases: Array<string> = await this.get_databases();
        //
        //Alert the user (and discontinue this show) if there are no databases
        if (databases.length === 0) {alert('No databases are found');return}
        //
        //Populate the database selector
        const selector: HTMLSelectElement = this.populate_selector(databases);
        //
        //Add a listener to show a selected database
        selector.onchange = async () => await this.show_dbase();
        //
        await this.show_dbase();
    }

    //Show the selected database. 
    async show_dbase(): Promise<void> {
        //
        //Remove the current database, if any
        if (this.current_db !== undefined) this.current_db.hook.removeChild(this.current_db.svg);
        //
        //Get the selected database. For yu to get here, there must be one. 
        const dbname: string = this.get_selected_value("databases");
        //
        //Get the metavisuo database -- an extension of the schema.database
        this.current_db = await this.get_metadb(dbname);
        //
        //Draw the entities and relationships
        await this.current_db.draw();
    }
}

//This is the class we are modelling visually
export class database extends schema.database {
    //
    //This is the svg property.
    public svg: SVGElement;
    //
    //The entities of the current application database.
    public entities: {[index: string]: entity};
    //
    //Collection of (unindexed) raltons for thos entity
    public relations: Array<relation>;
    // 
    //Set the view box properties.
    //
    //Set the panning attributes of a view box.
    public panx: number = 0;
    public pany: number = 0;
    //
    //Set the scaling attributes of a view box.
    public zoomx: number = 128;
    public zoomy: number = 64;
    //
    //The database name that holds the metadata; its either this database -- if
    //the metadata is embeded, or the standalone metavisuo
    public meta_dbname?:string;
    // 
    //class constructor.
    constructor(
        //The HTML tag where to hook the svg element for this database
        public hook: HTMLElement,
        //
        //This is the view from which we launched this metavisuo database
        public view: outlook.view,
        //
        //The schema database that is the extension of this meta-visuo version  
        public dbase: schema.database
    ) {
        super(dbase.static_dbase);

        //Prepare to set the SVG element
        // 
        //Create the svg element in our content element in the html file.
        this.svg = this.view.document.createElementNS(svgns, "svg");
        //
        //Attach the svg to the hook.
        hook.appendChild(this.svg);
        //
        //Add an event listener for moving the entity group to the double clicked position.
        this.svg.ondblclick = (ev) => this.entity_move(ev);
        // 
        //Add the view box attribute, based on the zoom and pan settings.
        this.svg.setAttribute("viewBox", `${[this.panx, this.pany, this.zoomx, this.zoomy]}`);
        //
        //Add the zooom out event listener to the zoom_out button
        this.view.get_element('zoom_out').onclick = () => this.zoom('out');
        this.view.get_element('zoom_in').onclick = () => this.zoom('in');
        // 
        //Add the pan_left,pan_right,pan_up and pan_down event listener button.
        this.view.get_element('pan_left').onclick = () => this.pan('left');
        this.view.get_element('pan_right').onclick = () => this.pan('right');
        this.view.get_element('pan_up').onclick = () => this.pan('up');
        this.view.get_element('pan_down').onclick = () => this.pan('down');
        //
        //Get the save button for adding an event listener
        this.view.get_element('save').onclick = async () => await this.save();
        //
        //Pan the documents in view, depending on the selected keys
        //Add a test key press event
        onkeydown = (ev)=>this.pan_with_keys(ev); 
        //
        //Create arrow markers, e.g., the crawfoot for relationships,
        this.create_markers();
        //
        //Create the meta-visuo entities
        this.entities = this.create_entities(dbase);
        //
        //Create the meta_visuo relations 
        this.relations = this.create_relations(dbase);
    }

    //Pan using the keyboard
    pan_with_keys(event: KeyboardEvent): void {
        //
        //Use the event code to pan
        switch (event.code) {
            case "ArrowRight": this.pan('right'); break;
            case "ArrowLeft": this.pan('left'); break;
            case "ArrowUp": this.pan('up'); break;
            case "ArrowDown": this.pan('down'); break;
            default:
        }
    }

    //Create arrow markers, e.g., the crawfoot for relationships,
    create_markers(): void {
        //
        //Define relationship markers
        //
        //Define the tick marker
        new marker.tick(this.svg);
        // 
        //Draw the arrow marker
        new marker.arrow(this.svg);
        // 
        //Draw the craw_foot marker
        new marker.foot_optional(this.svg);
        // 
        new marker.foot_optional_identifier(this.svg);
        //Draw the craw_foot marker
        new marker.foot_mandatory(this.svg);
        // 
        new marker.foot_manda_identifier(this.svg);
    }

    //Zoming out is about increasing the zoom x an y components of this database
    //by some fixed percentage, say 10%
    zoom(dir: 'in' | 'out'): void {
        //
        // 
        const sign = dir === 'in' ? +1 : -1;
        //
        //Change the database zooms
        this.zoomx = this.zoomx + sign * this.zoomx * 10 / 100;
        this.zoomy = this.zoomy + sign * this.zoomy * 10 / 100;
        //
        this.svg.setAttribute("viewBox", `${[this.panx, this.pany, this.zoomx, this.zoomy]}`);
    }
    // 
    //
    pan(dir: 'up' | 'left' | 'right' | 'down'): void {
        //
        //Determine x, the amount by which to pan x, as 5% of 132
        const x = 5 / 100 * 132;
        //
        //Detemine y,the amount by which to pan y, as 5% of 64
        const y = 5 / 100 * 64;
        //
        //Determine the pan direction and make the necessary pan
        //property changes
        switch (dir) {
            case 'up':
                //
                //Change the pany by some positive amount (y)
                this.pany = this.pany + y;
                //
                //Limit the diagram in view to the view,i.e., such that it is not hidden from the view
                if (this.pany > 50) {
                    //
                    //Alert the user that the document might be getting out of view
                    alert("This document is out of view, move down or zoom out to view it");
                    //
                    //Prevent the user from moving further out of view
                    return;
                }
                break;
            case 'down':
                //    
                //Change pany y with some negative amount (y)
                this.pany = this.pany - y;
                //
                //Limit the diagram in view to the view,i.e., such that it is not hidden from the view
                if (this.pany < -50) {
                    //
                    //Alert the user that the document might be getting out of view
                    alert("This document is out of view, move up or zoom out to view it");
                    //
                    //Prevent the user from moving further out of view
                    return;
                }
                break;
            case 'left':
                //
                //Change the pan x with some positive amount (x)
                this.panx = this.panx + x;
                //console.log(this.panx);
                //
                //Limit the diagram in view to the view,i.e., such that it is not hidden from the view
                if (this.panx > 50) {
                    //
                    //Alert the user that the document might be getting out of view
                    alert("This document is out of view, move right or zoom out to view it");
                    //
                    //Prevent the user from moving further out of view
                    return;
                }
                break;
            case 'right':
                //Change panx with some negative amount (x)
                this.panx = this.panx - x;
                //
                //Limit the diagram in view to the view,i.e., such that it is not hidden from the view
                if (this.panx < -50) {
                    //
                    //Alert the user that the document might be getting out of view
                    alert("This document is out of view, move left or zoom out to view it");
                    //
                    //Prevent the user from moving further out of view
                    return;
                }
                // this.panx +=x;
                break
        }
        //
        //Effect the changes
        this.svg.setAttribute("viewBox", `${[this.panx, this.pany, this.zoomx, this.zoomy]}`);

    }

    //Create the metavisuo entiies
    create_entities(dbase: schema.database): {[index: string]: entity} {
        //
        //Start with an empty collection of entites
        const entities: {[index: string]: entity} = {};
        //
        //
        //Loop over all schema entities and convert them to metavisuo versions, saving and 
        //drawing them at the same time
        for (const ename in dbase.entities) {
            //
            //Create the meta-visuo entity (with default, i.e., random, xand y coordinates)
            const ent = new entity(this, ename);

            //Save the newly created entity to the metavisuo entities.
            entities[ename] = ent;
        }
        //
        //Return the constructed entities
        return entities;
    }
    //
    //Save the entity coordinates to the database
    async save(): Promise<void> {
        //
        //Collect all the labels for saving the x and y coordinates to a database
        const layouts: Array<quest.layout> = [...this.collect_labels()];
        //
        //Execute the loading of layouts
        const result: 'Ok' | string = await server.exec(
            'questionnaire',
            [this.meta_dbname!],
            'load_common',
            [layouts]
        );
        //
        //Report the result
        alert(result);
    }

    //Collect all the label layouts needed for saving the status of the this
    //database
    *collect_labels(): Generator<quest.label> {
        //
        //The name of teh databse
        yield [this.name, 'dbase', 'name'];
        //
        //Save the current pan and zoom values to the 
        yield [this.panx, 'dbase', 'pan_x'];
        yield [this.pany, 'dbase', 'pan_y'];
        yield [this.zoomx, 'dbase', 'zoom_x'];
        yield [this.zoomy, 'dbase', 'zoom_y'];
        //
        //For each entity, generate labels for saving the x/y cordinates 
        for (const key in this.entities) {
            //
            //Get the entity
            const entity: entity = this.entities[key];
            //
            yield [entity.name, 'entity', 'name', [entity.name]];
            yield [entity.x, 'entity', 'x', [entity.name]];
            yield [entity.y, 'entity', 'y', [entity.name]];
        }
    }

    // 
    //Draw the database entities and relations
    async draw(): Promise<void> {
        //
        //Set the datanase that contaims the metata. It's either this one, if 
        //the metadata subsystem are mbedded, or the external one, metavisou
        this.meta_dbname = this.entities['dbase']===undefined  ? 'metavisuo':this.name;;
        //
        //Load the position data for the entities from the database
        await this.load_x_y_positions();
        //
        //Ovrride the default zoom and pan settings with those from the database
        //await this.load_viewbox();
        //
        //Draw the entities
        for (const ename in this.entities) this.entities[ename].draw();
        // 
        //Draw the relationships.
        this.relations.forEach(Relation => Relation.draw());
    }

    //Load the entities' x and y coordinates from the metavisuo database
    async load_x_y_positions(): Promise<void> {
        //
        //Set the x and y coordinates
        //
        //Compile the sql
        const sql: string =
            `select
                entity.name,
                entity.x,
                entity.y
             from
                entity
                inner join dbase on entity.dbase = dbase.dbase
             where
                dbase.name = '${this.name}'   
            `
        //
        //Retrieve the data 
        const result: Array<{name: string, x: number, y: number}> = await server.exec
        ('database', 
        [`${this.meta_dbname}`], 
        'get_sql_data', 
        [sql]);
        //
        //Use the result to set the x and y coordinates for the matching entity
        //in this database
        result.forEach(row => {
            const entity = this.entities[row.name];
            entity.x = row.x;
            entity.y = row.y
        });
    }
    //
    //Loop over all metavisuo entities, extract the foreign keys, for each foreign key
    //find out the home and away entity, use them to create our relations and save the relations.
    create_relations(dbase: schema.database): Array<relation> {
        //
        //Start with an empty list or relations
        const relations: Array<relation> = [];
        // 
        //For each metavisuo entity...
        for (const ename in dbase.entities) {
            //
            //a. Get the named entity
            const entity: schema.entity = dbase.entities[ename];
            //
            //b. Extract the foreign keys of the named entity.
            //
            //b.1 Get the columns of the entity
            const columns: Array<schema.column> = Object.values(entity.columns);
            //
            //b.2 Extract the foreign key columns by filtering
            const foreign_keys: Array<schema.foreign> = <Array<schema.foreign>>
                columns.filter(col => col instanceof schema.foreign);
            // 
            //For each foreign key...
            for (const foreign_key of foreign_keys) {
                //
                //Find out the home (src) and away entity(dest).
                //
                //Get the source (home) meta_visuo.entity
                const src: entity = this.entities[ename];
                //
                //Get the dest (away) entity, if it belongs to the same database as the current 
                //application
                const dest: entity | false = this.get_away_entity(foreign_key);
                //
                //Skip the relation if it points to an entity outside of the current database
                if (dest !== false) {
                    //Use the home and away entity to create the relationship.
                    const Relation: relation = new relation(src, dest);
                    //
                    //Save the relation
                    relations.push(Relation);
                }
            }
        }
        return relations;
    }
    //
    //Get the dest (away) entity, if it belongs to the same database as that of the current 
    //application.
    get_away_entity(Foreign: schema.foreign): entity | false {
        //
        //Get the referenced database name
        const dbname: string = Foreign.ref.dbname;
        //
        //Continue only if the database name is the same as that of the application's database
        if (dbname !== this.dbase.name) return false;
        //
        //Get the referenced table name
        const ename: string = Foreign.ref.ename;
        //
        //Get and return the referenced entity
        return this.entities[ename];
    };

    // 
    //Move the selected entity to the double-clicked position
    entity_move(ev: MouseEvent): void {
        //
        //1. Get the selected entity
        //
        //Get the group that corresponds to the selected entity
        const group = <SVGGraphicsElement | null> this.svg.querySelector('.selected');
        //
        //If there is no selection then discontinue the move
        if (group === null) return;
        //
        //
        //Get the name of the entity; it is the same as the id of the group
        const ename: string = group.id;
        //
        //Get the named entity
        const entity: entity = this.entities[ename];
        //
        //Get the coordinates of the double-clicked position (in real units)
        const position: DOMPoint = this.entity_get_new_position(ev, group);
        //
        entity.move(position);
    }

    // 
    //Get the coordinates of the double-clicked position (in real units)
    //Get the coordinates of the double-clicked position, given the event generated by the
    //double clicking. This proceeds as follows:-
    entity_get_new_position(ev: MouseEvent, element: SVGGraphicsElement): DOMPoint {
        //
        //-Get the mouse coordinates (in pixels) where the clicking occured on the canvas. Use
        //client coordinates and then use the screen ctm for the transformation
        // We investigated and the combination worked why it worked????
        const x: number = ev.clientX;
        const y: number = ev.clientY;
        //
        //-Convert the mouse pixel coordinates to the real world coordinates, given our current
        // viewbox
        //
        //Use the x and y pixels to define an svg point
        const point_old: DOMPoint = new DOMPoint(x, y);
        //
        //Get the CTM matrix which transforms a real world coordinate to pixels.
        const ctm: DOMMatrix | null = element.getScreenCTM();
        //
        //If the ctm is null, then something is unusual. CRUSH
        if (ctm === null) throw 'A null dom matrix was not expected';
        //
        //BUT we want pixels to real world, i.e., the inverse of the CTM
        const ctm_inverse: DOMMatrix = ctm.inverse();

        //
        //Use the inverse matrix of the CTM matrix to transform the old point to new one
        const point_new: DOMPoint = point_old.matrixTransform(ctm_inverse);
        //
        return point_new;
    }
}

//Container for markers used for labeling relationships
namespace marker {
    //
    // This class is for managing all the code that is jointly shared by the markers
    abstract class root {
        //
        constructor(public svg: SVGElement) {
            //
            //DRAW THE LINE  MARKER
            // Create the marker element for the attributes.
            const marker: SVGMarkerElement = <SVGMarkerElement> document.createElementNS(svgns, "marker");
            // 
            //Attach the marker to the svg element
            this.svg.appendChild(marker);
            // 
            // Supply the marker attributes
            //
            //Define the marker view box
            const panx: number = -20;
            const pany: number = -20;
            // 
            //Set the width of the viewport into which the <marker> is to be fitted when it is 
            //rendered according to the viewBox
            const realx: number = 64;
            // 
            //Set the height of the viewport into which the <marker> is to be fitted when it is 
            //rendered according to the viewBox 
            const realy: number = 64;
            //
            //Marker size (pixels)
            //Set the height of the marker
            const tickheight: number = 20;
            // 
            //Set the width of the marker
            const tickwidth: number = 20;
            //
            //Set the marker view box
            marker.setAttribute("viewBox", `${[panx, pany, realx, realy]}`);
            //
            //Set the name of the marker
            marker.setAttribute("id", this.constructor.name);
            //
            //
            //Set the reference point for the marker to be the center of the viewbox
            //Define the x coordinate of the marker referencing point
            marker.setAttribute("refX", `${0.5 * realx}`);
            // 
            //Define the y coordinate of the marker referencing point
            marker.setAttribute("refY", `${0.5 * realy}`);
            marker.setAttribute("markerWidth", `${tickwidth}`);
            marker.setAttribute("markerHeight", `${tickheight}`);
            //
            marker.setAttribute("orient", "auto-start-reverse");
            //
            //Trace the path that defines this marker
            const path: SVGElement = this.get_path();
            // 
            // Attach the line marker to the marker element
            marker.appendChild(path);
        }
        // 
        abstract get_path(): SVGPathElement;
    }

    //The code that is specific to the arrow
    export class arrow extends root {
        //
        constructor(svg: SVGElement) {
            super(svg);
        }
        // 
        //Draw the arrow marker
        get_path(): SVGPathElement {
            //
            //Draw the arrow path
            const path: SVGPathElement = document.createElementNS(svgns, "path");
            //
            // Draw the arrow path
            // path.setAttribute("d", "M 8 8 L 0 4 L 0 12 z");
            return path;
        }
    }
    // The code that is specific to the chickenfoot
    // 
    export class foot_optional extends root {
        //
        constructor(svg: SVGElement) {
            super(svg);
        }
        // 
        //Draw the chickenfoot path
        get_path(): SVGPathElement {
            //
            //Draw the chickenfoot path
            const path: SVGPathElement = document.createElementNS(svgns, "path");
            //
            // The path representing an Optional relation.
            //
            path.setAttribute('d', 'M 30 32, L-18 32,M 10 22, L 30 22 M 10 42, L 30 42 M 10 22 L 10 42');
            // The class responsible for styling the craw foot.
            path.setAttribute('class', 'chickenfoot');
            return path;
        }
    }
    // 
    // 
    export class foot_optional_identifier extends root {
        //
        constructor(svg: SVGElement) {
            super(svg);
        }
        // 
        //Draw the chickenfoot path
        get_path(): SVGPathElement {
            //
            //Draw the chickenfoot path
            const path: SVGPathElement = document.createElementNS(svgns, "path");
            //
            // The path representing an Optional relation.
            //
            path.setAttribute('d', 'M 30 32, L-18 32,M 10 22, L 30 22 M 10 42, L 30 42 M 10 22 L 10 42,M -7 16 L-16 42.6 M -32 -2 L-4.5 42.6');
            //      
            // The class responsible for styling the craw foot.
            path.setAttribute('class', 'chickenfoot');
            return path;
        }
    }

    export class foot_mandatory extends root {
        //
        constructor(svg: SVGElement) {
            super(svg);
        }
        // 
        //Draw the chickenfoot path
        get_path(): SVGPathElement {
            //
            //Draw the chickenfoot path
            const path: SVGPathElement = document.createElementNS(svgns, "path");
            // 
            // The crawfoot representing a mandatory relation
             path.setAttribute('d', 'M 30 32, L-18 32,M 10 22, L 30 22 M 10 42, L 30 42 M 10 22 L 10 42,M 1 16 L1 44 ');
             
            // The class responsible for styling the craw foot.
            path.setAttribute('class', 'chickenfoot');
            return path;
        }
    }
     // 
     export class foot_manda_identifier extends root {
        //
        constructor(svg: SVGElement) {
            super(svg);
         }
         
        // 
        //Draw the chickenfoot path
        get_path(): SVGPathElement {
            //
            //Draw the chickenfoot path
            const path: SVGPathElement = document.createElementNS(svgns, "path");
            //
            // The path representing an Optional relation.
            //
            path.setAttribute('d', 'M 30 32, L-18 32,M 10 22, L 30 22 M 10 42, L 30 42 M 10 22 L 10 42,M 1 16 L1 44 M -7 16 L-16 42.6 M -32 -2 L-4.5 42.6 ');
            // The class responsible for styling the craw foot.
            path.setAttribute('class', 'chickenfoot');
            return path;
        }
    }
    //The code that is specific to the line_tick_path
    export class tick extends root {
        //
        constructor(svg: SVGElement) {
            super(svg)
        }
        // 
        //Draw the tick mark  
        get_path(): SVGPathElement{
            //
            // Creating the line marker.
            const path_tick = document.createElementNS(svgns, "path");
            //
            //Draw the path that represent a line tick mark
            path_tick.setAttribute("d", "M 30 30 L 30 44");
            // 
            //The class responsible for styling the tick-map
            path_tick.setAttribute('class', 'tick');
            // 
            //Return the svg element
            return path_tick;
        }
    }
}
// 
//The entity in the meta-visuo namespace is an extension of the schema version
class entity extends schema.entity {
    //
    //The position of this entity in the e-a-r drawing
    public x: number;
    public y: number;
    //
    //The radius of the circle that defines our entity
    radius: number = 5;
    //
    //The angle of the attributes
    angle: number = 0;
    //
    element?: SVGGraphicsElement;
    //
    attributes: Array<schema.attribute>;
    //
    //Redeclare the entity database to make consistent with metavisuon one
    declare dbase: database;
    //
    constructor(
        //
        //The metavisuo database
        dbase: database,
        //
        public name: string,
        //
        //The center of the circle that represents this entity 
        x?: number,
        y?: number
    ) {
        //
        //Construct the schema entity 
        super(dbase, name);
        //
        //Set the x and y value to to either the given values or a random number
        this.x = x === undefined ? dbase.zoomx * Math.random() : x;
        this.y = y === undefined ? dbase.zoomy * Math.random() : y;
        //
        //Get this entity's columns 
        const columns: Array<schema.column> = Object.values(this.columns);
        //
        //Keep only the attributes
        this.attributes = <Array<schema.attribute>> columns.filter(col => col instanceof schema.attribute);
    }

    //Draw this  as a circle with attributes at some angle
    draw(): entity {
        //
        //Draw the circle of the entity and return the circle element
        const circle: SVGCircleElement = this.draw_circle();
        // 
        //Draw the labels of the entity and return an element under which all the lebeling 
        //elements are grouped
        const attributes: SVGElement = this.draw_attributes();
        //
        //Draw the entity text and return the text element
        const text: SVGTextElement = this.draw_text(this.name, this.x, this.y);
        //
        //Group the elements that define an entity
        this.element = this.draw_group(circle, attributes, text);
        //Return this entity
        return this;
    }

    //Draw the circle that represents the entity 
    draw_circle(): SVGCircleElement {
        //		
        //Create the circle element to represent an entity  
        const c: SVGCircleElement = document.createElementNS(svgns, "circle");
        // 
        //Attach the circle to the svg element
        this.dbase.svg.appendChild(c);
        // 
        // Set the x coordinate of the centre of the circle
        c.setAttribute("cx", `${this.x}`);
        // 
        // Set the y coordinate of the centre of the circle
        c.setAttribute("cy", `${this.y}`);
        // 
        // Set the circle radius.
        c.setAttribute("r", `${this.radius}`);
        //
        return c;
    }
    // 
    //Create a group that puts the entity circle,labels and text into a single group
    // 
    draw_group(circle: SVGCircleElement, labels: SVGElement, text: SVGTextElement): SVGGraphicsElement {
        // 
        // Create the entity group tag
        const group: SVGGraphicsElement = document.createElementNS(svgns, "g");
        //
        //Assign the group id, to match the entity being created
        group.id = this.name;
        // 
        //Attach the circle, labels and text elements to the entity group
        group.append(circle, labels, text);
        //
        //Atach the entity group to the svg
        this.dbase.svg.appendChild(group);
        //
        //Add an event listener such that when this entity is clicked on, the selection is  
        //removed from any other entity that is selected and this becomes selected 
        group.onclick = () => this.select();
        // 
        //Return the entity group
        return group;
    }
    // 
    // Draw the name of the entity represented on the diagram
    draw_text(name: string, centerx: number, centery: number): SVGTextElement {
        // 
        // Create the text element to representan entity
        const text: SVGTextElement = document.createElementNS(svgns, "text");
        // 
        // Attach the text to the svg element
        this.dbase.svg.appendChild(text);
        // 
        // Set the x and y coordinates of the text
        text.setAttribute("x", `${centerx}`);
        text.setAttribute("y", `${centery}`);
        text.setAttribute("class", 'lables');
        // 
        // Set the text position of the entity
        text.setAttribute("text-anchor", "middle");
        text.textContent = (`${name}`);
        //
        return text;
    }
    // 
    // Draw the attributes of this entity
    draw_attributes(): SVGElement {

        //A. Create a tag for grouping all the attributes.This is the tag that we return eventually
        // 
        //Create a group tag for placing all our attributes.
        const gattr: SVGElement = document.createElementNS(svgns, "g");
        // 
        //Attach the group element to the svg tag.
        this.dbase.svg.appendChild(gattr);
        // 
        // Rotate the g tag about the center according to the suggested angle. 
        gattr.setAttribute("transform", `rotate(${this.angle},${this.x}, ${this.y})`);
        // 
        //The id necessary for styling
        gattr.setAttribute('class', 'gattribute');
        // 
        //B. Create the polyline that is the backbone of the attributes
        //
        //Create the polyline element 
        const poly: SVGPolylineElement = document.createElementNS(svgns, "polyline");
        // 
        //Attach the polyline to the svg element
        gattr.appendChild(poly);
        //
        //Get the points that define the polyline segments, in the format of e.g., 
        // ["3,40" "5,36" "9,32"]
        const values: Array<string> = this.attributes.map((lables, i) => {
            return `${this.x},
                ${this.y - this.radius - 2 * i}`;
        });
        // 
        //Join the values with a space separator 
        const points: string = values.join(" ");
        // 
        //Define the polyline segments 
        poly.setAttribute('points', points);
        // 
        //The class to be provided in order to style the attribute hosting the attributes
        poly.setAttribute('class', 'attrpoly');
        //
        //Attach the markers to the polyline segments, assuming that we have defined a marker
        //by that name
        poly.setAttribute("marker-mid", "url(#tick)");
        poly.setAttribute("marker-end", "url(#tick)");
        // 
        //C. Create a tag for grouping the text elements that represent the attribute names,
        //so that we can control the  positioning, especially the top and bottom margins
        const gtext = document.createElementNS(svgns, "g");
        //
        //Attach the text group tag to the parent attribute group
        gattr.appendChild(gtext);
        // 
        //Defining the top and left margins of the text labels
        const left: number = 1;
        const top: number = 0.5;
        //
        // Provide top and and left margins for the text labels  
        gtext.setAttribute("transform", `translate(${left},${top})`);
        //
        //For each attribute name, draw its label
        this.attributes.forEach((attribute, i) => this.attribute_draw(attribute.name, i, gtext));
        //
        //Return the attribute group
        return gattr;
    }
    // 
    //Draw the given label at the given index position
    attribute_draw(
        //
        //The lable that represents the properties in an entity 
        label: string,
        //
        // 
        index: number,
        //
        //The group that attach together the attributes and the line segments together 
        gtext: Element,

    ): void {
        //
        //Create the label text Element
        const element: SVGTextElement = <SVGTextElement> document.createElementNS(svgns, "text");
        // 
        //Append the label text element to the gtext group element
        gtext.appendChild(element);

        //Set the x coordinate to the fixed value of x
        element.setAttribute("x", `${this.x}`);
        //
        //Set the y coordinate to the radius plus 1 units from the center minus index times 4
        element.setAttribute("y", `${this.y - this.radius - 2 * index}`);
        //
        //Set the name of the label
        element.textContent = label;
    }
    // 		
    //Mark this entity as selected
    select() {
        //
        //Get the entity that was previously selected
        const previous: HTMLElement | null = this.dbase.svg.querySelector('.selected');
        //
        //If there is any, deselect it
        if (previous !== null) previous.classList.remove('selected');
        //
        //Mark this entity as selected
        this.element!.classList.add('selected');
    }
    // 
    //Move this entity to the given position
    move(position: DOMPoint): void {
        //
        //Update the cordinates of this entity with the new position
        this.x = position.x;
        this.y = position.y;
        //
        //Set the angle of the moved entity to 0
        this.angle = 0;
        //
        //Remove from the svg, the element that corresponds to this entity
        this.dbase.svg.removeChild(this.element!);
        //
        //5. Re-draw the selected entity such that the center of the entity's circle
        //lies at the double clicked position
        this.draw();
        //
        //Clear all relations
        this.dbase.relations.forEach(Relation => Relation.clear());
        //
        //Draw all relations
        this.dbase.relations.forEach(Relation => Relation.draw());
        //
        //Mark the entity as selected
        this.element?.classList.add('selected');
    }
}
//
//This class represents an is_a relation between two entities
class relation {
    //The entity from the relation comes
    public src: entity;
    //
    //The entity to where the relation ends
    public dest: entity;
    // 
    //The polyline that represents this relationship
    public polyline?: SVGElement;
    // 
    constructor(src: entity, dest: entity) {
        this.src = src;
        this.dest = dest;
    }

    //Draw the relation between the source and the destination entities
    draw(): void {
        //
        //Get the 3 points that define the relation betweeen the source  and
        //the destination entities, e.g., {start:{x:4,y:50}, mid:{x:7, y:10}, end:{x:40, y:19}}
        const {start, mid, end} = this.get_relation_points(this.src, this.dest);
        //
        //Express the points in the form required for a polyline, e.g., 4,50 7,10 40,19 
        const p1 = `${start.x},${start.y}`;
        const p2 = `${mid.x}, ${mid.y}`;
        const p3 = `${end.x},${end.y}`;

        // 			POLYLINE
        // Create the polyline element
        const polyline: SVGPolylineElement = <SVGPolylineElement> document.createElementNS(svgns, "polyline");
        // 
        //Attach the polyline to the svg element
        this.src.dbase.svg.appendChild(polyline);
        // 
        //Set the polyline's points
        polyline.setAttribute('points', `${p1} ${p2} ${p3}`);
        // 
        //The class that will style the lines showing the relations.
        polyline.setAttribute('class', 'relations');
        // 
        //Attach the marker to the middle point of the polyline. Please ensure that
        //the marker named arrow is available. How? By executing the marker drawing code
        polyline.setAttribute("marker-mid", "url(#arrow)");
        polyline.setAttribute("marker-start", `url(#${this.get_marker_name()})`);
        //
        //Save the polyline for future references
        this.polyline = polyline;
    }
    
    //Get teh name of the marker, depending on the type of this relation
    get_marker_name():string{
        //
        //Get the whether the relation is optional or not
        const optional:boolean = this.is_optional();
        //
        //Get whether the relation is used for identification or not
        const id:boolean = this.is_id();
        //
        //Detern the type of chicken foot dependning on the 2 variables:optional anf
        //id
        switch(optional){
            case true:
                switch(id){
                    case true: return "foot_optional_identifier";
                    case false:return "foot_optional";
                }    
                break;
            case false:
                switch(id){
                    case true: return "foot_manda_identifier";
                    case false:return "foot_mandatory";
                }
                break;
        }
    }    
    
    //Determin if this relaion is used for identification or not. It is, if the
    //column on which it is used is used for identification. The source of the
    //a reltion is its home. This is also where we put the chicken foot.
    is_id():boolean{
        //
        //Get the name of the colum that matches this relation. It is the same
        //as that of the destination entity
        const cname = this.dest.name;
        //
        //Get the (schema) column that matches the column name
        const column:schema.column = this.src.columns[cname];
        //
        //Use the available is_id function to return the request
        return column.is_id();
    }
    
    //Determine if this relaion is optional or not. It is, if the
    //column on which it is used is nullable. The source of the
    //a relation is its home. This is also where we put the chicken foot.
    is_optional():boolean{
        //
        //Get the name of the colum that matches this relation. It is the same
        //as that of the destination entity
        const cname = this.dest.name;
        //
        //Get the (schema) column that matches the given name
        const column:schema.column = this.src.columns[cname];
        //
        //Retirn trie if this column is optional or not
        return ((column.is_nullable!==undefined) && (column.is_nullable==='YES')); 
    }
    
    //
    //Clear a relation
    clear(): void {
        //
        this.src.dbase.svg.removeChild(this.polyline!);
    }
    // 
    //The second version of calculating the exact mid point
    //
    //There are 3 points of interest along the hypotenuse between source entity a and 
    // source entity b, viz.,start, mid and end.
    get_relation_points(a: entity, b: entity): {start: DOMPoint, mid: DOMPoint, end: DOMPoint} {
        //
        //IN MOST CASES, when the x coordinate of circle 1 is equivalent to the x-coordinate
        // of circle 2, then we have a zero difference that will be carried forward to be
        // evaluated later on, will return values of infinity or zero later on.
        //
        //To prevent this from happening, if the difference,i.e., (b.y - a.y) or (b.x - a.x) is 
        //zero, set it to be greater than zero,i.e., 0.1 or greater.
        //
        //
        let opposite: number;
        //
        //The 'opposite' is the y distance between a and b
        //const opposite:number= b.y - a.y;
        if ((b.y - a.y) !== 0) {
            opposite = b.y - a.y;
        }
        else {
            opposite = 0.1;
        }
        let adjacent: number;
        //
        //The 'adjacent' is the x distance between the source entity of a and destination entity b
        //const adjacent = b.x - a.x;
        if ((b.x - a.x) !== 0) {
            adjacent = b.x - a.x;
        }
        else {
            adjacent = 0.1;
        }
        //
        //The hypotenuse is the square root of the squares of the 'adjacent' and 
        //the 'opposite'
        const hypotenuse = Math.sqrt(adjacent * adjacent + opposite * opposite);
        //
        //The targent of thita is calculated by 'oppposite' divided by the 'adjacent'
        const tanthita = opposite / adjacent;
        //
        //Thita is the inverse of the 'tanthita'
        const thita: number = Math.atan(tanthita);
        //
        //The angle of interest is...
        const phi = (adjacent > 0) ? thita : Math.PI + thita;
        //
        //Let 'start' be the point at  the intersection of the entity centered as the source 
        const start = this.get_point(a, phi, a.radius);
        //
        //Let 'mid' be the point mid way along entity source and destination hypotenuse
        const mid = this.get_point(a, phi, 0.5 * hypotenuse);
        //
        //Let 'end' be the point at the intersection of hypotenuse and the entity referred as the  
        //destination
        const end = this.get_point(a, phi, hypotenuse - b.radius);
        //
        //Compile and return the desired final result
        return {start, mid, end};
    }
    // 
    //Returns the coordinates of the point which is 'hypo' units from 'a' along
    //the hypotenuse of a and b (which is inclined at angle thita) 
    get_point(a: entity, thita: number, hypo: number): DOMPoint {
        //
        //The 'opp' is the 'hypo' times the sine of 'thita';
        const opp: number = hypo * Math.sin(thita);
        //
        //The 'adj' is the 'hypo' times the cosine of thita where thita is the
        //angle between 'adj' and 'hypo'
        const adj = hypo * Math.cos(thita);
        //
        //The x coordinate of the mid point is 'adj' units from the center of a
        const x: number = a.x + adj;
        //
        //The y coordinate of the mid point is the 'opp' units from the center of a
        const y: number = a.y + opp;
        //
        //The desired point is at x and and y units from the origin
        return new DOMPoint(x, y);
    }
}   