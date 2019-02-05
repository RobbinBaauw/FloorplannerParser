import {parseString} from "xml2js";
import * as fs from "fs";

fs.readFile("./sources/test.xml", "utf8", (err, xml) => {
    parseString(xml, function (err, result) {
        const floors = result.project.floors;

        for (const floor of floors[0].floor) {

            const areas = floor.designs[0].design[0].areas[0].area;
            const lines = floor.designs[0].design[0].lines[0].line;

            const cuboids = Cuboid.parseCuboid(lines);
            const polygons = Polygon.parsePolygons(areas);

            const shapes: Shape[] = [...cuboids, ...polygons];

            let counter = 0;
            for (const shape of shapes) {
                counter += shape.setIds(counter);
            }

            shapes.sort((a, b) => {
                return a.getIterator() - b.getIterator();
            });

            let objString = "";
            for (const shape of shapes) {
                objString += shape.getVerticesString();
            }

            objString += "\n";

            for (const shape of shapes) {
                objString += shape.getFacesString();
            }

            fs.writeFileSync(`sources/floor_${floor.name[0]}.obj`, objString);

            console.log(`floor_${floor.name[0]}.obj`)
        }
    });
});

abstract class Shape {

    private currIterator: number;

    public abstract getVertices(): Vertex[];
    public abstract getFaces(): Face[];
    public abstract getType(): string;

    public setIds(currIterator: number): number {
        this.currIterator = currIterator;

        const startId = currIterator + 1;

        for (let i = 0; i < this.getVertices().length; i++) {
            const currVertex = this.getVertices()[i];

            currVertex.setId(startId + i);
        }

        return this.getVertices().length;
    }

    public getVerticesString(): string {
        let string = "";
        for (const vertex of this.getVertices()) {
            string += vertex.getVertexText();
            string += "\n";
        }

        return string;
    }

    public getFacesString(): string {
        let string = `o ${this.getType()}_${this.currIterator}\n`;
        for (const vertex of this.getFaces()) {
            string += vertex.getFaceText();
            string += "\n";
        }

        return string;
    }

    public getIterator(): number {
        return this.currIterator;
    }
}

class Cuboid extends Shape{


    constructor(private vertices: Vertex[], private faces: Face[]) {
        super();
    }

    public static parseCuboid(lines: any): Cuboid[] {
        const cuboids: Cuboid[] = [];

        for (const line of lines) {
            if (line.type[0] !== "default_wall") continue;

            const splitPoints = line.points[0].split(",");

            const points = [];

            for (const point of splitPoints) {
                points.push(...point.split(" "))
            }

            const vertices: Vertex[] = [];

            for (let i = 0; i < points.length; i += 3) {
                const x = parseFloat(points[i]);
                const y = parseFloat(points[i + 1]);
                const z = parseFloat(points[i + 2]);

                const vertex = new Vertex(x, y , z);
                vertices.push(vertex);
            }

            const thickness = line.thickness[0];

            cuboids.push(Cuboid.getCuboidFromVertices(vertices, thickness));
        }

        return cuboids;
    }

    public static getCuboidFromVertices(vertices: Vertex[], thickness: number): Cuboid {
        if (vertices.length !== 4) {
            throw new TypeError("Vertex length invalid");
        }

        const first = vertices[0];
        const fourth = vertices[3];

        const yChanges = first.x === fourth.x;

        const addToSides = thickness / 2;

        // Format: x y z
        const xLeftOriginal = (yChanges ? first.x - addToSides : first.x);
        const xRightOriginal = (yChanges ? first.x + addToSides : fourth.x);
        const yDownOriginal = (!yChanges ? first.y - addToSides : first.y);
        const yUpOriginal = (!yChanges ? first.y + addToSides : fourth.y);
        const zDown = 0;

        let xLeft = xLeftOriginal;
        let xRight = xRightOriginal;
        let yDown = yDownOriginal;
        let yUp = yUpOriginal;

        if (yChanges) {
            if (yUp >= yDown) {
                yUp += addToSides;
                yDown -= addToSides;
            } else {
                yUp -= addToSides;
                yDown += addToSides;
            }
        } else {
            if (xRight >= xLeft) {
                xRight += addToSides;
                xLeft -= addToSides;
            } else {
                xRight -= addToSides;
                xLeft += addToSides;
            }
        }

        // After exporting a cube this seemed the best order
        const v000 = new Vertex(xLeft, yDown, zDown);
        const v100 = new Vertex(xRight, yDown, zDown);
        const v010 = new Vertex(xLeft, yUp, zDown);
        const v110 = new Vertex(xRight, yUp, zDown);
        const v001 = new Vertex(xLeft, yDown, this.getHeight(yChanges, vertices, xLeftOriginal, yDownOriginal));
        const v101 = new Vertex(xRight, yDown, this.getHeight(yChanges, vertices, xRightOriginal, yDownOriginal));
        const v011 = new Vertex(xLeft, yUp, this.getHeight(yChanges, vertices, xLeftOriginal, yUpOriginal));
        const v111 = new Vertex(xRight, yUp, this.getHeight(yChanges, vertices, xRightOriginal, yUpOriginal));

        const f1 = new Face([v101, v111, v011, v001]);
        const f2 = new Face([v100, v110, v111, v101]);
        const f3 = new Face([v000, v010, v110, v100]);
        const f4 = new Face([v001, v011, v010, v000]);
        const f5 = new Face([v111, v110, v010, v011]);
        const f6 = new Face([v100, v101, v001, v000]);

        return new Cuboid([v000, v100, v010, v110, v001, v101, v011, v111], [f1, f2, f3, f4, f5, f6]);
    }

    private static getHeight(yChanges: boolean, vertices: Vertex[], currX: number, currY: number): number {
        if (!yChanges && vertices[0].x === currX) {
            return vertices[2].z;
        } else if (!yChanges && vertices[1].x === currX) {
            return vertices[3].z;
        } else if (yChanges && vertices[0].y === currY) {
            return vertices[2].z;
        } else if (yChanges && vertices[1].y === currY) {
            return vertices[3].z;
        } else {
            return vertices[3].z;
        }
    }

    public getFaces(): Face[] {
        return this.faces;
    }

    public getVertices(): Vertex[] {
        return this.vertices;
    }

    public getType(): string {
        return "wall";
    }

}

class Polygon extends Shape{

    constructor(private vertices: Vertex[], private faces: Face[]) {
        super();
    }

    public static parsePolygons(areas: any) {
        const polygons: Polygon[] = [];

        for (const area of areas) {
            const splitPoints = area.points[0].split(",");

            const points = [];

            for (const point of splitPoints) {
                points.push(...point.split(" "))
            }

            const vertices: Vertex[] = [];

            for (let i = 0; i < points.length; i += 3) {
                const x = parseFloat(points[i]);
                const y = parseFloat(points[i + 1]);
                const z = parseFloat(points[i + 2]);

                const vertex = new Vertex(x, y , z);
                vertices.push(vertex);
            }

            polygons.push(Polygon.getPolygonFromVertices(vertices));
        }

        return polygons;
    }

    public static getPolygonFromVertices(vertices: Vertex[]): Polygon {

        return new Polygon(vertices, [new Face(vertices)]);
    }

    public getFaces(): Face[] {
        return this.faces;
    }

    public getVertices(): Vertex[] {
        return this.vertices;
    }

    public getType(): string {
        return "polygon";
    }
}

class Face {
    constructor(private vertices: Vertex[]) {
    }

    public getVertices(): Vertex[] {
        return this.vertices;
    }

    public getFaceText(): string {

        let faceText = "f";

        for (const vertex of this.vertices) {
            faceText += ` ${vertex.getId()}`;
        }

        return faceText;
    }
}

class Vertex {

    private id: number;

    constructor(public x: number, public y: number, public z: number) {}

    public setId(id: number) {
        this.id = id;
    }

    public getId(): number {
        return this.id;
    }

    public copy(): Vertex {
        return new Vertex(this.x, this.y, this.z);
    }

    public getVertexText(): string {
        return `v ${this.x} ${this.z} ${this.y}`
    }
}
