import {parseString} from "xml2js";
import * as fs from "fs";

fs.readFile("./sources/house.fml", "utf8", (err, xml) => {
    parseString(xml, function (err, result) {
        const floors = result.project.floors;

        for (const floor of floors[0].floor) {
            const areas = floor.designs[0].design[0].areas[0].area;
            const lines = floor.designs[0].design[0].lines[0].line;

            const cuboids = Cuboid.parseCuboid(lines);
            Cuboid.alterSize(cuboids);

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

type matchingCuboidType = {
    cuboid: Cuboid,
    cuboidVertex: Vertex,
    myVertex: Vertex,
    myOtherVertex: Vertex
}

class Cuboid extends Shape{


    constructor(private vertices: Vertex[], private faces: Face[], private thickness: number, private yChanges: boolean, private originalVertices: Vertex[]) {
        super();
    }

    public static alterSize(cuboids: Cuboid[]) {
        for (const cuboid of cuboids) {

            const matchingCuboids = this.findMatchingCuboid(cuboids, cuboid);

            if (matchingCuboids !== null) {
                for (const matchingCuboid of matchingCuboids) {
                    const halfSize = matchingCuboid.cuboid.getThickness() / 2;

                    const myVertices = cuboid.getVertices();

                    if (cuboid.getYChanges()) {
                        const toBeUpdatedVertices = myVertices.filter(vertex => vertex.y === matchingCuboid.myVertex.y);

                        if (matchingCuboid.myVertex.y > matchingCuboid.myOtherVertex.y) {
                            toBeUpdatedVertices.map(vertex => vertex.y += halfSize);
                        } else {
                            toBeUpdatedVertices.map(vertex => vertex.y -= halfSize);
                        }
                    } else {
                        const toBeUpdatedVertices = myVertices.filter(vertex => vertex.x === matchingCuboid.myVertex.x);

                        if (matchingCuboid.myVertex.x > matchingCuboid.myOtherVertex.x) {
                            toBeUpdatedVertices.map(vertex => vertex.x += halfSize);
                        } else {
                            toBeUpdatedVertices.map(vertex => vertex.x -= halfSize);
                        }
                    }
                }
            }
        }
    }

    private static findMatchingCuboid(cuboids: Cuboid[], currCuboid: Cuboid): matchingCuboidType[] {
        const firstVertex = currCuboid.getOriginalVertices()[0];
        const secondVertex = currCuboid.getOriginalVertices()[1];

        const neighbours: matchingCuboidType[] = [];

        for (const cuboid of cuboids) {
            const currFirstVertex = cuboid.getOriginalVertices()[0];
            const currSecondVertex = cuboid.getOriginalVertices()[1];

            if (firstVertex.x === currFirstVertex.x && firstVertex.y === currFirstVertex.y) {
                neighbours.push({cuboid, cuboidVertex: currFirstVertex, myVertex: firstVertex, myOtherVertex: secondVertex});
            } else if (firstVertex.x === currSecondVertex.x && firstVertex.y === currSecondVertex.y) {
                neighbours.push({cuboid, cuboidVertex: currSecondVertex, myVertex: firstVertex, myOtherVertex: secondVertex});
            } else if (secondVertex.x === currFirstVertex.x && secondVertex.y === currFirstVertex.y) {
                neighbours.push({cuboid, cuboidVertex: currFirstVertex, myVertex: secondVertex, myOtherVertex: firstVertex});
            } else if (secondVertex.x === currSecondVertex.x && secondVertex.y === currSecondVertex.y) {
                neighbours.push({cuboid, cuboidVertex: currSecondVertex, myVertex: secondVertex, myOtherVertex: firstVertex});
            }
        }

        if (neighbours.length === 0) {
            return [];
        } else if (neighbours.length === 1) {
            return [neighbours[0]];
        } else {
            const correctPoints: matchingCuboidType[] = [];
            for (const neighbour of neighbours) {
                const myVertex = neighbour.myVertex;
                const otherpoints = neighbours.filter(currNeighbour => (currNeighbour.myVertex.x === myVertex.x) && (currNeighbour.myVertex.y === myVertex.y));
                if (otherpoints.length === 1) {
                    if (otherpoints[0].cuboid.getYChanges() !== currCuboid.getYChanges()) {
                        correctPoints.push(otherpoints[0]);
                    }
                }
            }

            return correctPoints;
        }
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

    private static getCuboidFromVertices(vertices: Vertex[], thickness: number): Cuboid {
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

        // After exporting a cube this seemed the best order
        const v000 = new Vertex(xLeftOriginal, yDownOriginal, zDown);
        const v100 = new Vertex(xRightOriginal, yDownOriginal, zDown);
        const v010 = new Vertex(xLeftOriginal, yUpOriginal, zDown);
        const v110 = new Vertex(xRightOriginal, yUpOriginal, zDown);
        const v001 = new Vertex(xLeftOriginal, yDownOriginal, this.getHeight(yChanges, vertices, xLeftOriginal, yDownOriginal));
        const v101 = new Vertex(xRightOriginal, yDownOriginal, this.getHeight(yChanges, vertices, xRightOriginal, yDownOriginal));
        const v011 = new Vertex(xLeftOriginal, yUpOriginal, this.getHeight(yChanges, vertices, xLeftOriginal, yUpOriginal));
        const v111 = new Vertex(xRightOriginal, yUpOriginal, this.getHeight(yChanges, vertices, xRightOriginal, yUpOriginal));

        const f1 = new Face([v101, v111, v011, v001]);
        const f2 = new Face([v100, v110, v111, v101]);
        const f3 = new Face([v000, v010, v110, v100]);
        const f4 = new Face([v001, v011, v010, v000]);
        const f5 = new Face([v111, v110, v010, v011]);
        const f6 = new Face([v100, v101, v001, v000]);

        return new Cuboid([v000, v100, v010, v110, v001, v101, v011, v111], [f1, f2, f3, f4, f5, f6], thickness, yChanges, vertices);
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

    public getOriginalVertices(): Vertex[] {
        return this.originalVertices;
    }

    public getThickness(): number {
        return this.thickness;
    }

    public getYChanges(): boolean {
        return this.yChanges;
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
            if (area.type[0] !== "generated_area") continue;

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

    private static getPolygonFromVertices(vertices: Vertex[]): Polygon {

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
